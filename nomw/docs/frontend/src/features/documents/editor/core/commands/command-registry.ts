export type CommandHandler = (args?: any) => boolean | void;

export class CommandRegistry {
  private commands: Map<string, CommandHandler> = new Map();

  public register(name: string, handler: CommandHandler): () => void {
    this.commands.set(name, handler);
    return () => this.commands.delete(name);
  }

  public execute(name: string, args?: any): boolean {
    const handler = this.commands.get(name);
    if (handler) {
      const res = handler(args);
      return res !== false;
    }
    console.warn(`Command '${name}' not found in CommandRegistry.`);
    return false;
  }

  public has(name: string): boolean {
    return this.commands.has(name);
  }
}
