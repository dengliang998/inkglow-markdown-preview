export interface RenderMessage {
  type: "render";
  markdown: string;
  assets: Record<string, string>;
  allowRemoteImages: boolean;
}

export interface ReadyMessage {
  type: "ready";
}

export interface OpenExternalMessage {
  type: "openExternal";
  href: string;
}

export interface OpenLocalMessage {
  type: "openLocal";
  href: string;
}

export type WebviewMessage = ReadyMessage | OpenExternalMessage | OpenLocalMessage | { type: "exportPdf" };
