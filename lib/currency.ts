export const Currencies = [
    {value: 'USD', label: '$ Dollar', locale: 'en-US'},
    {value: 'EUR', label: '€ Euro', locale: 'en-US'},
    {value: 'GBP', label: '£ Pound', locale: 'en-US'},
    {value: 'JPY', label: '¥ Yen', locale: 'en-US'},
]

export type Currency = (typeof Currencies)[0]