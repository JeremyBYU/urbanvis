export declare type HashFn<T> = (node: T) => string;
export declare type StopFn<T> = (node: T, goalNode: T) => boolean;
export declare type GenSuccessorsFn<T> = (node: T) => [T[], number[]];
export declare type HeuristicFn<T> = (node: T, gaolNode: T) => number;
export interface AsyncAstarResult<T> {
    status: AsyncAstarStatus;
    path?: Array<NodeCost<T>>;
}
export declare enum AsyncAstarStatus {
    NORM = 1,
    SUCCESS = 2,
    FAIL = 3,
    ERROR = 4,
}
export declare class NodeCost<T> {
    data: T;
    g: number;
    f: number;
    closed: boolean;
    open: boolean;
    parent: NodeCost<T>;
    constructor(data: any, open?: boolean, g?: number);
}
export declare class AsyncAstar<T> {
    finished: boolean;
    private nodeSet;
    private startNode;
    private goal;
    private hashFn;
    private genSuccessorsFn;
    private heuristicFn;
    private stopFn;
    private openList;
    constructor(start: T, goal: T, hashFn: HashFn<T>, genSuccessorsFn: GenSuccessorsFn<T>, heuristicFn: HeuristicFn<T>, stopFn?: StopFn<T>);
    searchAsync(iterations?: number, closedNodeCb?: any, openNodeCb?: any): AsyncAstarResult<T>;
    getPath(goal: NodeCost<T>): Array<NodeCost<T>>;
    getAllNodes(): Map<string, NodeCost<T>>;
    reset(start: any, goal: any): void;
}
