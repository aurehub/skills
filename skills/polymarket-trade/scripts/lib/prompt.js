import readline from 'readline';

export async function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(`${question} `, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'yes');
    });
    rl.once('close', () => resolve(false));
  });
}
