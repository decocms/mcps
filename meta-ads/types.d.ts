// Type declarations to fix runtime dependency issues
declare module "packages/bindings/src/well-known/collections.ts" {
  export const collections: any;
  export class CollectionBinding<T = any> {
    constructor(...args: any[]);
  }
  export type CollectionBindingType<T = any> = CollectionBinding<T>;
}
