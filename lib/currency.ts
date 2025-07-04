export const Currencies = [
    {value: 'USD', Label: '$ Dollar', locale: 'en-US'},
    {value: 'EUR', Label: '€ Euro', locale: 'en-US'},
    {value: 'GBP', Label: '£ Pound', locale: 'en-US'},
    {value: 'JPY', Label: '¥ Yen', locale: 'en-US'},
]

export type Currency = (typeof Currencies)[0]