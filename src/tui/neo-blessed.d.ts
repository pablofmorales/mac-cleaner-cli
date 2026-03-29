// neo-blessed is a maintained fork of blessed with the same API.
// Map its types to @types/blessed.
declare module "neo-blessed" {
  export * from "blessed";
  import blessed from "blessed";
  export default blessed;
}
