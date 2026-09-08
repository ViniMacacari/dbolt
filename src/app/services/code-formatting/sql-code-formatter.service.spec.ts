import { SqlCodeFormatterService } from './sql-code-formatter.service'
import { SqlFormatterLayoutService } from './sql-formatter-layout.service'

describe('SqlCodeFormatterService', () => {
  let formatter: SqlCodeFormatterService

  beforeEach(() => {
    formatter = new SqlCodeFormatterService(new SqlFormatterLayoutService())
  })

  it('formats a view with nested functions, CASE conditions, joins and comments', () => {
    const sql = `
      alter view order_summary as
      select o.id as order_id,
        coalesce(o.total, o.subtotal, 0) as amount,
        coalesce(p.installment_total, 0) - coalesce(p.amount_paid, 0) as open_amount,
        case
          when o.due_at < current_date and (coalesce(p.installment_total, 0) - coalesce(p.amount_paid, 0)) > 0 then 'late'
          when s.description = 'confirmed' then 'open'
          else 'late'
        end as status
      from sales.orders o
      join sales.payments p on p.order_id = o.id and p.installment_id = o.installment_id
      where o.type = 13
        and o.status in (
          1, -- created
          2, -- sent
          3 -- confirmed
        )
        and o.paid_at is null;
    `

    expect(formatter.format(sql, { indentSize: 4, indentCreateBody: false })).toBe(`ALTER VIEW order_summary AS
SELECT
    o.id AS order_id,
    COALESCE(
        o.total,
        o.subtotal,
        0
    ) AS amount,
    COALESCE(p.installment_total, 0)
        - COALESCE(p.amount_paid, 0) AS open_amount,
    CASE
        WHEN o.due_at < CURRENT_DATE
            AND (
                COALESCE(p.installment_total, 0)
                    - COALESCE(p.amount_paid, 0)
            ) > 0
            THEN 'late'
        WHEN s.description = 'confirmed'
            THEN 'open'
        ELSE 'late'
    END AS status
FROM
    sales.orders o
JOIN sales.payments p
    ON p.order_id = o.id
    AND p.installment_id = o.installment_id
WHERE
    o.type = 13
    AND o.status IN (
        1, -- created
        2, -- sent
        3 -- confirmed
    )
    AND o.paid_at IS NULL;`)
  })

  it('formats INSERT, UPDATE and DELETE statements consistently', () => {
    const sql = `
      insert into orders (id, customer_id, status) values (1, 20, 'new');
      update orders set status = 'paid', updated_at = current_timestamp where id = 1 and customer_id = 20;
      delete from orders where id = 2 and status = 'canceled';
    `

    expect(formatter.format(sql, { indentSize: 4 })).toBe(`INSERT INTO orders (
    id,
    customer_id,
    status
)
VALUES (
    1,
    20,
    'new'
);

UPDATE orders
SET
    status = 'paid',
    updated_at = CURRENT_TIMESTAMP
WHERE
    id = 1
    AND customer_id = 20;

DELETE FROM orders
WHERE
    id = 2
    AND status = 'canceled';`)
  })

  it('formats SQLScript procedure blocks and their nested DML statements', () => {
    const sql = `
      create procedure process_orders(in customer_id int)
      language sqlscript as
      begin
        declare total_count int;
        select count(*) into total_count from orders where customer_id = :customer_id;
        if total_count > 0 and customer_id is not null then
          update orders set status = 'processed', updated_at = current_timestamp where customer_id = :customer_id;
        else
          insert into audit_log (entity_id, action_name) values (:customer_id, 'none');
        end if;
        delete from queue where customer_id = :customer_id;
      end;
    `

    expect(formatter.format(sql, { indentSize: 4 })).toBe(`CREATE PROCEDURE process_orders(IN customer_id int) LANGUAGE SQLSCRIPT AS
BEGIN
    DECLARE total_count int;
    SELECT
        COUNT(*) INTO total_count
    FROM
        orders
    WHERE
        customer_id = :customer_id;
    IF total_count > 0
        AND customer_id IS NOT NULL THEN
        UPDATE orders
        SET
            status = 'processed',
            updated_at = CURRENT_TIMESTAMP
        WHERE
            customer_id = :customer_id;
    ELSE
        INSERT INTO audit_log (
            entity_id,
            action_name
        )
        VALUES (
            :customer_id,
            'none'
        );
    END IF;
    DELETE FROM queue
    WHERE
        customer_id = :customer_id;
END;`)
  })

  it('places the FROM source on an indented line and preserves its trailing comment', () => {
    const sql = 'select * from sample_table -- source used by the query'

    expect(formatter.format(sql, { indentSize: 4 })).toBe(`SELECT
    *
FROM
    sample_table -- source used by the query`)
  })

  it('keeps the formatted result stable and preserves BETWEEN as one condition', () => {
    const sql = `
      select id, status
      from orders
      where created_at between '2026-01-01' and '2026-12-31'
        and status in ('new', 'paid', 'closed');
    `
    const options = { indentSize: 2, indentCreateBody: false }
    const formatted = formatter.format(sql, options)

    expect(formatted).toContain("created_at BETWEEN '2026-01-01' AND '2026-12-31'")
    expect(formatter.format(formatted, options)).toBe(formatted)
  })
})
