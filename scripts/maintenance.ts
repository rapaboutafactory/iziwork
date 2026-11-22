import './env';
import { cleanup } from '../src/lib/retention';
import { closeDb } from '../src/lib/db';

async function main() {
  try {
    const removed = await cleanup();
    console.log('Очистка данных завершена:', removed);
  } catch (error) {
    console.error('Не удалось выполнить очистку данных:', error instanceof Error ? error.message : 'Неизвестная ошибка');
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
void main();
