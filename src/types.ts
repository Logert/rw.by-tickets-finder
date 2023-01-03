export type CallbackData = {
  type: 'stop' | 'start' | 'remove' | 'add';
  data?: number | string;
};
