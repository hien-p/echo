import { getContainerRuntimeClient } from "testcontainers";
/**
 * Executes a command inside the sui-tools container.
 *
 * @param command The command to execute as an array of strings.
 * @param suiToolsContainerId The ID of the sui-tools container.
 * @returns The output of the command execution.
 */
export const execCommand = async ({
  command,
  suiToolsContainerId,
}: {
  command: string[];
  suiToolsContainerId: string;
}) => {
  const client = await getContainerRuntimeClient();
  const container = client.container.getById(suiToolsContainerId);
  const result = await client.container.exec(container, command);
  if (result.exitCode !== 0) {
    console.log(result.stderr);
    throw new Error(`Command ${command.join(" ")} failed`);
  }
  return result.output;
};
