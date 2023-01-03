import { PrismaClient } from '@prisma/client';
import TelegramBot from 'node-telegram-bot-api';
import * as dotenv from 'dotenv';
import axios from 'axios';
import { CallbackData } from 'types';

dotenv.config();

export const prisma = new PrismaClient();

export const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

export const api = axios.create({ baseURL: 'https://pass.rw.by/ru' });

export const makeCallback = (data: CallbackData) => JSON.stringify(data);

export const parseCallback = (data: string) => JSON.parse(data) as CallbackData;
