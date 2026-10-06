// Classic content scripts share the same extension isolated world.
declare let lastRequestedJobId: string;
declare function findJobId(): string;
declare function loadCurrentJob(): Promise<void>;
