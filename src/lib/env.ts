// SPDX-License-Identifier: MIT
import { setTimeout as nodeSetTimeout } from "node:timers/promises";
import { getInput, setFailed, setOutput, setSecret } from "@actions/core";
import { getOctokit } from "@actions/github";
import { type Api, type ApiParams, makeApi } from "./api";
import { makeParams, type Params } from "./params";

export type RunEnv = {
  params: Params;
  getApi: (params: ApiParams) => Api;
  setFailed: (msg: string) => void;
  setOutput: (name: string, value: string) => void;
};

export function makeDefaultEnv(): RunEnv {
  return {
    params: makeParams({ getInput, setSecret }),
    getApi: makeApi({ getOctokit, sleep: nodeSetTimeout, now: Date.now }),
    setFailed,
    setOutput,
  };
}
