import type { InjectionKey, Ref } from "vue";
import type { Cell, Coordinate } from "../cell-state.ts";
import type { PlayerColors } from "../colors.ts";

export type BoardProps = {
  width: number;
  cells: Cell[];
  busy: boolean;
  pendingCells: string[];
  finished: boolean;
  participant: string;
  players: { participant: string; name: string }[];
  colors: PlayerColors;
  lost: boolean;
  won: boolean;
};
export const boardContext: InjectionKey<{
  props: BoardProps;
  pressedCells: Set<number>;
  visited: Map<string, Coordinate>;
  names: Ref<Map<string, string>>;
  click: (cell: Cell, event: MouseEvent) => void;
  flag: (cell: Cell) => void;
  begin: (cell: Cell, event: PointerEvent) => void;
  enter: (cell: Cell, event: PointerEvent) => void;
  release: () => void;
}> = Symbol("board");
