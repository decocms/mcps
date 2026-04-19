export interface Env {
  // Add any needed custom secrets or generic properties here.
  // Google Analytics auth is handled by createGoogleOAuth and its backend token logic.
  // We include this to fulfill the type requirements of withRuntime<Env>
  gaPropertyId?: string;
  MESH_REQUEST_CONTEXT?: {
    authorization?: string;
  };
}
