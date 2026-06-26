import { query } from './db.js';
import broadcast from './broadcast.js';

let time = 0;
let microtime = 0;

function init() {
  loadTime();
  startTimer();
}

async function loadTime() {
  try {
    const rows = await query('SELECT time FROM wof_environment WHERE id_environment = 1 LIMIT 1');
    if (rows.length > 0) {
      time = rows[0].time;
    }
  } catch (error) {
    console.error('Database error on retrieving environment time:', error);
  }
}

function startTimer() {
  setInterval(() => {
    microtime++;

    if (microtime % 60 === 0) {
      microtime = 0;
      time++;

      if (time % 24 === 0) {
        time = 0;
      }

      saveTime();
      broadcast.updateTime({ hour: time, minute: microtime });
    }
  }, 1000);
}

async function saveTime() {
  try {
    await query('UPDATE wof_environment SET time = ? WHERE id_environment = 1', [time]);
  } catch (error) {
    console.error('Database error on saving environment time:', error);
  }
}

function getTime(socket) {
  socket.emit('updateTime', { hour: time, minute: microtime });
}

export default {
  init,
  getTime
};
