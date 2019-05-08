import {CliCommand} from "./interface";
import {CommanderStatic} from "commander";
import {parse} from "@iarna/toml";
import fs from "fs";
import logger from "../../logger";
import BeaconNode from "../../node";
import {ethers} from "ethers";
import {CliError} from "../error";
import {IApiConstructor} from "../../rpc/api/interface";
import * as RPCApis from "../../rpc/api";
import deepmerge from "deepmerge";

interface BeaconConfigOptions {
  db: string;
  depositContract: string;
  eth1RpcUrl: string;
  rpc: string;
  configFile: string;
}

export class BeaconNodeCommand implements CliCommand {

  public register(commander: CommanderStatic): void {
    commander
      .command("beacon")
      .description("Start lodestar node")
      .option("-d, --db [db_path]", "Path to file database")
      .option("-dc, --depositContract [address]", "Address of deposit contract")
      .option("-eth1, --eth1RpcUrl [url]", "Url to eth1 rpc node")
      .option("--rpc [api]", "Exposes the selected RPC api, must be comma separated")
      .option("-c, --configFile [config_file]", "Config file path")
      .action(async (options) => {
        // library is not awaiting this method so don't allow error propagation
        // (unhandled promise rejections)
        try {
          await this.action(options);
        } catch (e) {
          logger.error(e.message);
        }

      });
  }

  public async action(options: BeaconConfigOptions): Promise<void> {
    let optionsMap: object = {
      db: {
        name: options.db
      },
      eth1: {
        depositContract: {
          address: options.depositContract
        },
        provider: await this.getProvider(options.eth1RpcUrl)
      },
      rpc: {
        apis: this.setupRPC(options.rpc)
      }
    };

    if (options.configFile){
      let data: Buffer;
      try {
        data = fs.readFileSync(options.configFile);
      } catch {
        throw new CliError(`${options.configFile} could not be parsed.`);
      }
      const parsed = parse(data.toString());
      logger.info(parsed);

      optionsMap = deepmerge(optionsMap, parsed);
    }

    const node = new BeaconNode(optionsMap);
    await node.start();
  }

  private setupRPC(rpc: string): IApiConstructor[] {
    const args = rpc ? rpc.split(",").map((option: string) => option.trim()) : [];
    return Object.values(RPCApis)
      .filter((api) => api !== undefined)
      .filter((api: IApiConstructor) => {
        return args.some((option: string) => {
          return api.name.toLowerCase().indexOf(option.toLowerCase()) > -1;
        });
      });
  }

  private async getProvider(eth1RpcUrl: string): Promise<ethers.providers.BaseProvider> {
    try {
      const provider = eth1RpcUrl ? new ethers.providers.JsonRpcProvider(eth1RpcUrl) : ethers.getDefaultProvider();
      await provider.getNetwork();
      return provider;
    } catch (e) {
      throw new CliError('Failed to connect to eth1 rpc node.');
    }
  }
}
