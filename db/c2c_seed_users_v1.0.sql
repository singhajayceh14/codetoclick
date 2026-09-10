-- Code to Click — starter accounts
-- Run AFTER c2c_schema_v1.1.sql. Change the emails and passwords before real use.
--
-- Passwords here are written in plain text ONLY so you can sign in the first
-- time. set_password() hashes them on the way in; the plain text is never
-- stored. Change them with:  select c2c.set_password('someone@x.com','newpw');

set search_path = c2c, public;

-- The organization these accounts belong to.
insert into organizations (id, name, base_currency)
values ('00000000-0000-0000-0000-0000000000aa', 'Code to Click', 'USD')
on conflict (id) do nothing;

insert into users (email, full_name) values
  ('owner@codetoclick.ai',   'Akhil Kaushal'),
  ('finance@codetoclick.ai', 'Finance Lead'),
  ('manager@codetoclick.ai', 'Delivery Manager'),
  ('viewer@codetoclick.ai',  'Read Only')
on conflict (email) do nothing;

-- Roles. owner = everything, finance = all figures + close months,
-- manager = allocations/revenue/cost, viewer = read only.
insert into memberships (org_id, user_id, role)
select '00000000-0000-0000-0000-0000000000aa', u.id, r.role
  from users u
  join (values
    ('owner@codetoclick.ai',   'owner'),
    ('finance@codetoclick.ai', 'finance'),
    ('manager@codetoclick.ai', 'manager'),
    ('viewer@codetoclick.ai',  'viewer')
  ) as r(email, role) on r.email = u.email::text
on conflict (org_id, user_id) do update set role = excluded.role;

-- Starter passwords. CHANGE THESE.
select set_password('owner@codetoclick.ai',   'ChangeMe!Owner1');
select set_password('finance@codetoclick.ai', 'ChangeMe!Finance1');
select set_password('manager@codetoclick.ai', 'ChangeMe!Manager1');
select set_password('viewer@codetoclick.ai',  'ChangeMe!Viewer1');
