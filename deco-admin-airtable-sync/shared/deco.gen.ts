export interface MeshRequestContext {
  authorization?: string;
}

export interface Env {
  MESH_REQUEST_CONTEXT: MeshRequestContext;
}
