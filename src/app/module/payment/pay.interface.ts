export interface ISSLCommerzIPN {
  val_id?: string;
  tran_id?: string;
  amount?: string;
  currency?: string;
  status?: string;

  bank_tran_id?: string;
  card_type?: string;
  card_brand?: string;
  card_issuer?: string;

  value_a?: string;
  value_b?: string;
  value_c?: string;
  value_d?: string;

  [key: string]: unknown;
}
