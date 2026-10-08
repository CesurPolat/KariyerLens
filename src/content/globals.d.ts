// Classic content scripts share the same extension isolated world.
declare function findJobId(): string;
declare function loadCurrentJob(): Promise<void>;
