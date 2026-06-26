import { query } from './db.js';
import infos from './infos.js';
import globalSettings from './settings.js';
import broadcast from './broadcast.js';

function init() {
  startMarketUpdater();
}

function startMarketUpdater() {
  const interval = Math.floor(Math.random() * 180000);
  setTimeout(async () => {
    await updateMarketPrices();
    startMarketUpdater();
  }, interval);
}

async function buy(socket, userId, cost) {
  if (!userId || cost < 0) return;

  try {
    await query('UPDATE wof_user SET money = money - ? WHERE id_user = ?', [cost, userId]);
    infos.decreaseMoney(socket, userId, cost);
  } catch (error) {
    console.error(`Database error for ${userId} while buying:`, error);
  }
}

async function sell(socket, userId, price) {
  if (!userId || price < 0) return;

  try {
    await query('UPDATE wof_user SET money = money + ? WHERE id_user = ?', [price, userId]);
    infos.increaseMoney(socket, userId, price);
  } catch (error) {
    console.error(`Database error for ${userId} while selling:`, error);
  }
}

async function updateMarketPrices() {
  const market = globalSettings.getMarketPricesData();

  for (const [type, currentPrice] of Object.entries(market)) {
    let diff = Math.floor(Math.random() * 1337) % 5;
    if (Math.floor(Math.random() * 100) % 2 === 1) {
      diff *= -1;
    }

    let newPrice = currentPrice + diff;
    if (newPrice <= 0) {
      newPrice = 1;
    }

    globalSettings.setTileMarketPrice(type, newPrice);

    try {
      await query('UPDATE wof_market SET price = ? WHERE type = ?', [newPrice, type]);
    } catch (error) {
      console.error(`Database error on updating market price for type ${type}:`, error);
    }
  }

  broadcast.refreshMarketPrices();
}

export default {
  init,
  buy,
  sell
};
