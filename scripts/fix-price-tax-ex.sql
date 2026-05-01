update price_records
set price_tax_ex = case
  when coalesce(tax_rate, 0) = 0 then round(price_tax_in, 1)
  else round(price_tax_in / (1 + tax_rate / 100.0), 1)
end
where price_tax_in is not null
  and tax_rate is not null
  and (
    price_tax_ex is null
    or abs(
      round(
        case
          when tax_rate = 0 then price_tax_ex
          else price_tax_ex * (1 + tax_rate / 100.0)
        end,
        1
      ) - price_tax_in
    ) > 0.11
  );
