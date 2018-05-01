const puppeteer = require('puppeteer');
const notifier = require('node-notifier');

const config = {
  from: '', // Наименование станции отправления, пример: МИНСК-ПАССАЖИРСКИЙ
  to: '', // Наименование станции прибытия, пример: БРЕСТ-ЦЕНТРАЛЬНЫЙ
  date: '', // Дата поездки, пример: 03.05.2018
  trainNumber: '', // Номер поезда, пример: 607Б
  ticketCount: 2, // Количество билетов

  headless: true, // Запуск в режиме браузера false
  selectors: {
    from: 'input[id$="form1:textDepStat"]',
    to: 'input[id$="form1:textArrStat"]',
    date: 'input[id$="form1:dob"]',
    search: 'input[id$="form1:buttonSearch"]',
    table: 'table[id$="form2:tableEx1"]'
  }
};

let ticketsFound = false;
let message = '';
let trainFound = false;

const startParser = async () => {
  const browser = await puppeteer.launch({ headless: config.headless });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 2 });
  await page.goto('https://poezd.rw.by/wps/portal/home/rp/schedule');
  await page.type(config.selectors.from, config.from);
  await page.type(config.selectors.to, config.to);
  await page.$eval(config.selectors.date, elem => elem.value = '');
  await page.type(config.selectors.date, config.date);
  await page.click(config.selectors.search);
  await page.waitForNavigation();

  // const trainCount = await page.$$eval(config.selectors.table + ' > tbody > tr', table => table.length);
  // console.log('Найдено поездов: ', trainCount || 0);

  const checkTrain = async () => {
    const train = await page.$$eval(config.selectors.table + ' > tbody > tr',
      (trainRow, trainNumber) => trainRow.reduce((result, item) => {
        if (item.querySelector('span').innerText.indexOf(trainNumber) !== -1) {
          result.name = item.querySelector('span > a > span').innerText;
          const [, , , , , , , ...places] = item.childNodes;
          result.places = places.map(tr => tr.firstChild.innerText);
        }
        return result;
      }, {}), config.trainNumber);

    const [, , , , , , , ...headers] = await page.$$eval(config.selectors.table + ' > thead > tr > th',
      item => item.map(th => th.children.length ? th.querySelector('span').innerText.slice(0, -3) : ''));
    if (train.name) {
      const places = train.places.map((item, key) => {
        return {
          type: headers[key],
          tickets: parseInt(item) || 0
        }
      });

      ticketsFound = places.some(item => item.tickets >= config.ticketCount);
      trainFound = true;
      message = places.reduce((message, item) => message + `${item.type}: ${item.tickets} `, '');
      console.log('check train');
    } else {
      console.log('Поезд не найден ' + config.trainNumber);
      await browser.close();
    }
  };

  await checkTrain();

  const ticketFound = () => {
    notifier.notify({
      title: 'Билеты найдены на поезд ' + config.trainNumber,
      message,
      sound: true
    });
    console.log(message);
  };

  if (!ticketsFound && trainFound) {
    let delay = setInterval(async () => {
      await checkTrain();
      await page.reload();
      if (ticketsFound) {
        clearInterval(delay);
        ticketFound();
        await browser.close();
      }
    }, 60000);
  } else {
    ticketFound();
    await browser.close();
  }

};

if (config.from.length && config.to.length && config.date && config.trainNumber.length) {
  startParser();
} else {
  console.log('Введите номер поезда, станцию отправления, станцию назначения и дату.')
}

