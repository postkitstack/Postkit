import fs from "fs";
import path from "path";
import {getPostkitDir} from "../../../common/config";
import type {StackState} from "../types/config";

function getStackStatePath(): string {
  return path.join(getPostkitDir(), "stack", "state.json");
}

export function readStackState(): StackState {
  const statePath = getStackStatePath();
  if (!fs.existsSync(statePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf-8")) as StackState;
  } catch {
    return {};
  }
}

export function writeStackState(state: StackState): void {
  const statePath = getStackStatePath();
  fs.mkdirSync(path.dirname(statePath), {recursive: true});
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", "utf-8");
}
