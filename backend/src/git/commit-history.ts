import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const fieldSeparator = '\0';

export interface GitCommit {
  hash: string;
  short_hash: string;
  message: string;
  author: string;
  date: string;
}

export type ReadGitCommits = (path: string) => Promise<GitCommit[]>;

export async function readGitCommits(path: string): Promise<GitCommit[]> {
  const { stdout } = await execFileAsync(
    'git',
    ['log', '-n', '10', `--format=%H%x00%h%x00%s%x00%an%x00%aI%x00`],
    { cwd: path, timeout: 5000, maxBuffer: 1024 * 1024 },
  );
  const fields = stdout.split(fieldSeparator);
  if (fields.at(-1)?.trim() === '') fields.pop();
  if (fields.length % 5 !== 0) throw new Error('Unexpected Git log output');

  const commits: GitCommit[] = [];
  for (let index = 0; index < fields.length; index += 5) {
    const [hash, shortHash, message, author, date] = fields.slice(index, index + 5);
    if (!hash || !shortHash || message === undefined || !author || !date) {
      throw new Error('Unexpected Git log output');
    }
    commits.push({
      hash: hash.trimStart(),
      short_hash: shortHash,
      message,
      author,
      date: new Date(date).toISOString(),
    });
  }
  return commits;
}
