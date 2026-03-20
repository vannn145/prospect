export const CATEGORY_OPTIONS = [
  { value: 'dentist', label: 'Dentista' },
  { value: 'lawyer', label: 'Advogado' },
  { value: 'doctor', label: 'Médico' },
  { value: 'hospital', label: 'Hospital' },
  { value: 'pharmacy', label: 'Farmácia' },
  { value: 'physiotherapist', label: 'Fisioterapia' },
  { value: 'veterinary_care', label: 'Clínica veterinária' },
  { value: 'restaurant', label: 'Restaurante' },
  { value: 'cafe', label: 'Cafeteria' },
  { value: 'bar', label: 'Bar' },
  { value: 'bakery', label: 'Padaria' },
  { value: 'supermarket', label: 'Mercado' },
  { value: 'convenience_store', label: 'Loja de conveniência' },
  { value: 'shopping_mall', label: 'Shopping' },
  { value: 'gym', label: 'Academia' },
  { value: 'beauty_salon', label: 'Salão de beleza' },
  { value: 'spa', label: 'Spa / Estética' },
  { value: 'hair_care', label: 'Cabelereiro / Barbearia' },
  { value: 'pet_store', label: 'Pet shop' },
  { value: 'real_estate_agency', label: 'Imobiliária' },
  { value: 'accountant', label: 'Contabilidade' },
  { value: 'insurance_agency', label: 'Seguros' },
  { value: 'bank', label: 'Banco' },
  { value: 'atm', label: 'Caixa eletrônico' },
  { value: 'school', label: 'Escola' },
  { value: 'book_store', label: 'Livraria' },
  { value: 'clothing_store', label: 'Loja de roupas' },
  { value: 'shoe_store', label: 'Loja de calçados' },
  { value: 'jewelry_store', label: 'Joalheria' },
  { value: 'furniture_store', label: 'Loja de móveis' },
  { value: 'car_repair', label: 'Oficina mecânica' },
  { value: 'car_dealer', label: 'Concessionária' },
  { value: 'car_wash', label: 'Lava rápido' },
  { value: 'gas_station', label: 'Posto de combustível' },
  { value: 'electrician', label: 'Eletricista' },
  { value: 'plumber', label: 'Encanador' },
  { value: 'hardware_store', label: 'Loja de materiais' },
  { value: 'electronics_store', label: 'Loja de eletrônicos' },
  { value: 'home_goods_store', label: 'Utilidades domésticas' },
  { value: 'florist', label: 'Floricultura' },
  { value: 'laundry', label: 'Lavanderia' },
  { value: 'travel_agency', label: 'Agência de viagens' },
];

export const CATEGORY_LABELS = Object.fromEntries(
  CATEGORY_OPTIONS.map(({ value, label }) => [value, label])
);

CATEGORY_LABELS.accounting = 'Contabilidade';

export const STATUS_SITE_LABELS = {
  sem_site: 'Sem site',
  site_fraco: 'Site fraco',
  site_ok: 'Site ok',
};

export function getCategoryLabel(value) {
  return CATEGORY_LABELS[value] || value || '-';
}

export function getStatusSiteLabel(value) {
  return STATUS_SITE_LABELS[value] || value || '-';
}
