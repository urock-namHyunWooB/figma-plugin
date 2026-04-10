// test/audits/hungarianObserver/ObserverCollector.ts

import type {
  ObserverCollector as IObserverCollector,
  ObserverResult,
  MergeRecord,
  Pass1Match,
  Pass2Data,
} from "./types";

export function createObserverCollector(fixture: string): IObserverCollector {
  const collector: IObserverCollector = {
    fixture,
    mergeOrder: [],
    merges: [],
    _stack: [],
    _topLevelCounter: 0,

    pushMerge(info) {
      let index: string;
      if (this._stack.length === 0) {
        // Top-level merge
        this._topLevelCounter++;
        index = String(this._topLevelCounter);
      } else {
        // Sub-merge: parent index + "." + sibling count
        const parent = this._stack[this._stack.length - 1];
        const siblingNum = parent.subMerges.length + 1;
        index = `${parent.index}.${siblingNum}`;
      }

      const record: MergeRecord = {
        index,
        path: info.path,
        depth: info.depth,
        childrenACount: info.childrenACount,
        childrenBCount: info.childrenBCount,
        variantA: info.variantA,
        variantB: info.variantB,
        pass1: [],
        pass2: undefined,
        subMerges: [],
      };

      if (this._stack.length > 0) {
        this._stack[this._stack.length - 1].subMerges.push(record);
      } else {
        this.merges.push(record);
      }
      this._stack.push(record);
    },

    addPass1Match(match: Pass1Match) {
      if (this._stack.length === 0) return;
      this._stack[this._stack.length - 1].pass1.push(match);
    },

    setPass2(data: Pass2Data) {
      if (this._stack.length === 0) return;
      this._stack[this._stack.length - 1].pass2 = data;
    },

    popMerge() {
      this._stack.pop();
    },

    toResult(): ObserverResult {
      return {
        fixture: this.fixture,
        variantCount: this.mergeOrder.length,
        mergeOrder: [...this.mergeOrder],
        merges: this.merges,
      };
    },
  };

  return collector;
}
