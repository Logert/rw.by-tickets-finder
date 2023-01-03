import { Config, User } from '@prisma/client';
import { load } from 'cheerio';

import { bot, prisma, api, makeCallback, parseCallback } from './utils';

const trainTypeMap: Record<string, string> = {
  regional_business: 'Региональные линии бизнес-класса',
  interregional_economy: 'Межрегиональные линии экономкласса',
};

const callbackDataTemp: Record<number, Record<string, Record<string, object>>> = {};

const checkTrain = async (user: User, config: Config, notify = false) => {
  try {
    console.log(`checking for ${user.username}, with ${config.from} ${config.to} ${config.date} ${config.type}`);
    const response = await api.get<string>('/route/', {
      params: { from: config.from, to: config.to, date: config.date },
    });
    const fullUrl = (response.request as { res: { responseUrl: string } }).res.responseUrl;

    const $ = load(response.data);
    const data = $('.sch-table__row-wrap', '.sch-table__body')
      .map((i, el) => ({
        title: $('.sch-table__route', el).text(),
        type: $('.sch-table__row', el).attr('data-train-type'),
        arrival: $('.sch-table__time.train-from-time', el).text().trim(),
        departure: $('.sch-table__time.train-to-time', el).text().trim(),
        tickets: $('.sch-table__t-item', el)
          .map((_, ticketEl) => ({
            name: $('.sch-table__t-name', ticketEl).text(),
            quantity: $('.sch-table__t-quant span', ticketEl).text(),
            cost: $('.sch-table__t-cost .ticket-cost', ticketEl).text(),
          }))
          .get(),
      }))
      .get();

    if (data.length) {
      await Promise.all(
        data
          .filter((item) => config.type === 'all' || item.type === config.type)
          .map((item) => {
            const ticketsLength = item.tickets.filter((ticket) => !!ticket.quantity).length;
            if (ticketsLength || notify) {
              return bot.sendMessage(
                user.chatId,
                `Билеты на поезд: *${item.title}*, отправление в *${item.arrival}*, прибытие в *${
                  item.departure
                }*, на дату *${config.date}*

${!ticketsLength && notify ? '*Мест нет*' : ''}${item.tickets
                  .map(
                    (ticket) => `${ticket.name ? `${ticket.name}:\n` : ''}*${ticket.quantity}* шт ${ticket.cost} BYN`
                  )
                  .join('\n')}

[Маршрут](${fullUrl})
                `,
                { parse_mode: 'Markdown' }
              );
            }
            return Promise.resolve();
          })
      );
    } else {
      await bot.sendMessage(user.chatId, `[Маршрут](${fullUrl}) не найден`, {
        parse_mode: 'Markdown',
      });
    }
  } catch (e) {
    console.error(e);
  }
};

const formatConfig = (config: Config) =>
  `${config.from} — ${config.to}${config.type !== 'all' ? `, ${trainTypeMap[config.type]}` : ''} ${config.date}`;

bot.onText(/\/start/, async (msg) => {
  const { username, id } = msg.chat;
  const currentUser = await prisma.user.findFirst({ where: { username } });
  const userConfigs = await prisma.config.findMany({ where: { user: { username } }, orderBy: { createdAt: 'desc' } });
  if (currentUser && userConfigs.length) {
    await bot.sendMessage(id, `Выберите существующие параметры или создайте новый`, {
      reply_markup: {
        inline_keyboard: userConfigs.map((config) => [
          {
            text: formatConfig(config),
            callback_data: makeCallback({ type: 'start', data: config.id }),
          },
        ]),
      },
    });
  } else {
    await bot.sendMessage(id, 'Задайте параметры поиска, команда: /add');
  }
});

bot.onText(/\/params/, async (msg) => {
  const { username, id } = msg.chat;
  const configs = await prisma.config.findMany({ where: { user: { username } } });
  if (configs?.length) {
    await bot.sendMessage(
      id,
      `Текущие параметры поиска:
${configs.map((config) => `${formatConfig(config)} - ${config.active ? 'запущен' : 'не запущен'}`).join('\n')}
  `,
      { parse_mode: 'Markdown' }
    );
  } else {
    await bot.sendMessage(id, 'У вас нет параметров');
  }
});

bot.onText(/\/add/, async (msg) => {
  const { username, id } = msg.chat;
  const userConfigs = await prisma.config.findMany({ where: { user: { username } } });
  if (userConfigs.length < 3) {
    let from = '';
    let to = '';
    let date = '';

    await bot.sendMessage(id, `Введите станцию отправления:`);
    await new Promise((resolve) => {
      bot.once('message', ({ chat: { id: newId }, text }) => {
        if (id === newId) {
          from = text;
          resolve('');
        }
      });
    });
    await bot.sendMessage(id, `Введите станцию назначения:`);
    await new Promise((resolve) => {
      bot.once('message', ({ chat: { id: newId }, text }) => {
        if (id === newId) {
          to = text;
          resolve('');
        }
      });
    });
    await bot.sendMessage(id, `Введите дату:`);
    await new Promise((resolve) => {
      bot.once('message', ({ chat: { id: newId }, text }) => {
        if (id === newId) {
          date = text;
          resolve('');
        }
      });
    });
    callbackDataTemp[id] = {
      ...callbackDataTemp[id],
      add: {
        all: { from, to, date },
        regional_business: { from, to, date },
        interregional_economy: { from, to, date },
      },
    };
    await bot.sendMessage(id, `Выберите тип:`, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: 'Все',
              callback_data: makeCallback({ type: 'add', data: 'all' }),
            },
          ],
          [
            {
              text: trainTypeMap.regional_business,
              callback_data: makeCallback({ type: 'add', data: 'regional_business' }),
            },
          ],
          [
            {
              text: trainTypeMap.interregional_economy,
              callback_data: makeCallback({ type: 'add', data: 'interregional_economy' }),
            },
          ],
        ],
      },
    });
  } else {
    await bot.sendMessage(id, 'У Вас не может быть больше чем 3 параметра, удалите один и добавьте новый');
  }
});

bot.onText(/\/stop/, async (msg) => {
  const { username, id } = msg.chat;
  const userConfigs = await prisma.config.findMany({ where: { user: { username } }, orderBy: { createdAt: 'desc' } });
  await bot.sendMessage(id, `Выберите параметр который вы хотите остановить`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Все', callback_data: makeCallback({ type: 'stop' }) }],
        ...userConfigs.map((config) => [
          {
            text: formatConfig(config),
            callback_data: makeCallback({ type: 'stop', data: config.id }),
          },
        ]),
      ],
    },
  });
});

bot.onText(/\/del/, async (msg) => {
  const { username, id } = msg.chat;
  const userConfigs = await prisma.config.findMany({ where: { user: { username } }, orderBy: { createdAt: 'desc' } });
  await bot.sendMessage(id, `Выберите параметр который вы хотите удалить`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Все', callback_data: makeCallback({ type: 'remove' }) }],
        ...userConfigs.map((config) => [
          {
            text: formatConfig(config),
            callback_data: makeCallback({ data: config.id, type: 'remove' }),
          },
        ]),
      ],
    },
  });
});

bot.onText(/\/now/, async (msg) => {
  const { username, id } = msg.chat;
  const user = await prisma.user.findFirst({ where: { username }, include: { configs: true } });
  const runConfigs = user?.configs.filter((config) => config.active) || [];
  if (runConfigs.length) {
    await Promise.all(runConfigs.map((config) => checkTrain(user, config, true)));
  } else {
    await bot.sendMessage(id, `У вас нет параметров которые необходимо запустить сейчас`);
  }
});

bot.on('callback_query', async (query) => {
  const { username, id } = query.message.chat;
  const { type, data: callbackData } = parseCallback(query.data);

  if (callbackData) {
    if (type === 'start' || type === 'stop') {
      await prisma.config.update({ where: { id: +callbackData }, data: { active: type === 'start' } });
      await bot.sendMessage(id, type === 'start' ? 'Параметр запущен' : 'Параметр остановлен', {
        reply_markup: { remove_keyboard: true },
      });
    }
    if (type === 'remove') {
      await prisma.config.delete({ where: { id: +callbackData } });
      await bot.sendMessage(id, 'Параметр удален', {
        reply_markup: { remove_keyboard: true },
      });
    } else if (type === 'add') {
      const { from, to, date } = callbackDataTemp[id].add[callbackData] as Config;

      if (from && to && date) {
        await prisma.user.upsert({
          where: { username },
          create: {
            chatId: id,
            username,
            configs: {
              connectOrCreate: {
                where: { from_to_date: { from, to, date } },
                create: { from, to, date, type: callbackData.toString() },
              },
            },
          },
          update: {
            configs: {
              connectOrCreate: {
                where: { from_to_date: { from, to, date } },
                create: { from, to, date, type: callbackData.toString() },
              },
            },
          },
        });
        const config = await prisma.config.findFirst({ where: { from, to, date }, orderBy: { createdAt: 'desc' } });
        await bot.sendMessage(id, `Параметр добавлен: ${formatConfig(config)}`);
      } else {
        await bot.sendMessage(id, `Ошибка в параметрах`);
      }
      delete callbackDataTemp[id].add;
    }
  } else if (type === 'stop') {
    await prisma.config.updateMany({ where: { user: { username } }, data: { active: false } });
    await bot.sendMessage(id, `Все параметры остановлены`, {
      reply_markup: { remove_keyboard: true },
    });
  } else if (type === 'remove') {
    await prisma.config.deleteMany({ where: { user: { username } } });
    await bot.sendMessage(id, `Все параметры удалены`, {
      reply_markup: { remove_keyboard: true },
    });
  }
  await bot.deleteMessage(id, query.message.message_id.toString());
});

setInterval(async () => {
  const users = await prisma.user.findMany({
    where: { configs: { some: { active: true } } },
    include: { configs: true },
  });

  await Promise.all(
    users.map((user) =>
      Promise.all(user.configs.filter((config) => config.active).map((config) => checkTrain(user, config)))
    )
  );
}, 1000 * 60 * 5); // 5 минут
