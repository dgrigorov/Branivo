export type FscCategoryConfig = {
  key: string;
  label: string;
  url: string;
};

export const FSC_CATEGORIES: FscCategoryConfig[] = [
  {
    key: 'non_life_insurers',
    label: 'Застрахователи по общо застраховане',
    url: 'https://www.fsc.bg/zastrahovatelna-deynost/spisaczi-podnadzorni-licza/zastrahovateli-po-obstho-zastrahovane/',
  },
  {
    key: 'life_insurers',
    label: 'Застрахователи по животозастраховане',
    url: 'https://www.fsc.bg/zastrahovatelna-deynost/spisaczi-podnadzorni-licza/zastrahovateli-po-zhivotozastrahovane/',
  },
  {
    key: 'reinsurers',
    label: 'Презастрахователи',
    url: 'https://www.fsc.bg/zastrahovatelna-deynost/spisaczi-podnadzorni-licza/prezastrahovateli-po-obstho-i-zhivotozastrahovane/',
  },
  {
    key: 'insurance_brokers',
    label: 'Застрахователни брокери',
    url: 'https://www.fsc.bg/zastrahovatelna-deynost/spisaczi-podnadzorni-licza/zastrahovatelni-brokeri/',
  },
];
