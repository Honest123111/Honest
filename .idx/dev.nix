# Firebase Studio workspace: Node 22, installs deps on first open, and runs the
# Next.js dev server as the web preview.
{ pkgs, ... }: {
  channel = "stable-24.05";
  packages = [ pkgs.nodejs_22 ];
  idx = {
    extensions = [ "dbaeumer.vscode-eslint" "bradlc.vscode-tailwindcss" ];
    workspace = {
      onCreate = { npm-install = "npm ci"; };
    };
    previews = {
      enable = true;
      previews = {
        web = {
          command = [ "npm" "run" "dev" "--" "--port" "$PORT" "--hostname" "0.0.0.0" ];
          manager = "web";
        };
      };
    };
  };
}
