import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

interface RpcResponse {
  id?: number;
  result?: unknown;
  error?: { code?: number; message?: string };
}

export class StdioMcpClient {
  readonly child: ChildProcessWithoutNullStreams;
  #buffer = "";
  #id = 0;
  #pending = new Map<
    number,
    { resolve: (value: RpcResponse) => void; reject: (error: Error) => void }
  >();
  #stderr = "";

  constructor(options: {
    command: string;
    args: string[];
    cwd: string;
    env: NodeJS.ProcessEnv;
  }) {
    this.child = spawn(options.command, options.args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.stdout.on("data", (chunk) => this.#onData(chunk.toString()));
    this.child.stderr.on("data", (chunk) => {
      this.#stderr += chunk.toString();
    });
    this.child.on("exit", (code) => {
      if (code === 0) return;
      const error = new Error(`mcp_process_exited:${code}:${this.#stderr.slice(-2000)}`);
      for (const pending of this.#pending.values()) pending.reject(error);
      this.#pending.clear();
    });
  }

  #onData(chunk: string): void {
    this.#buffer += chunk;
    let newline = this.#buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.#buffer.slice(0, newline).trim();
      this.#buffer = this.#buffer.slice(newline + 1);
      if (line.startsWith("{")) {
        try {
          const message = JSON.parse(line) as RpcResponse;
          if (typeof message.id === "number") {
            const pending = this.#pending.get(message.id);
            if (pending) {
              this.#pending.delete(message.id);
              pending.resolve(message);
            }
          }
        } catch {
          // Ignore transport noise. A missing response still fails through timeout/exit.
        }
      }
      newline = this.#buffer.indexOf("\n");
    }
  }

  async initialize(): Promise<void> {
    await this.call("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "pathrule-benchmark-seed", version: "0.1.0" },
    });
    this.notify("notifications/initialized", {});
  }

  call(method: string, params: unknown): Promise<RpcResponse> {
    const id = ++this.#id;
    return new Promise<RpcResponse>((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    }).then((response) => {
      if (response.error) {
        throw new Error(`mcp_rpc_error:${method}:${response.error.message ?? response.error.code}`);
      }
      return response;
    });
  }

  notify(method: string, params: unknown): void {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  async tool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const response = await this.call("tools/call", { name, arguments: args });
    const result = response.result as { isError?: boolean; content?: Array<{ text?: string }> };
    if (result?.isError) {
      throw new Error(`mcp_tool_error:${name}:${JSON.stringify(result)}`);
    }
    return result;
  }

  close(): void {
    this.child.kill();
  }
}

export function parseToolJson(result: unknown): unknown {
  const content = (result as { content?: Array<{ text?: string }> })?.content ?? [];
  const text = content.map((part) => part.text ?? "").join("\n").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
