import dayjs from 'dayjs';

export const getStartDateForFilter = (filter: string, now?: dayjs.Dayjs) => {
  const n = now || dayjs();
  switch (filter) {
    case '7D':
      return n.subtract(6, 'day').startOf('day');
    case '30D':
      return n.subtract(29, 'day').startOf('day');
    case 'This Month':
      return n.startOf('month');
    case 'This Year':
      return n.startOf('year');
    default:
      return n.subtract(6, 'day').startOf('day');
  }
};

export const getDaysCountForFilter = (filter: string, now?: dayjs.Dayjs) => {
  const n = now || dayjs();
  if (filter === '7D') return 7;
  if (filter === '30D') return 30;
  if (filter === 'This Month') {
    const start = n.startOf('month');
    return n.diff(start, 'day') + 1;
  }
  if (filter === 'This Year') return 12;
  return 7;
};

export default { getStartDateForFilter, getDaysCountForFilter };
