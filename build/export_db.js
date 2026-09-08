/**
 * Export the project hierarchy from PostgreSQL to data/raw.json.
 *
 * Run from the dhms_nhai_msrv directory so knex/pg and .env resolve:
 *   cd ../dhms_nhai_msrv
 *   node -r dotenv/config ../nhai-network-explorer/build/export_db.js
 *
 * Reads PSQL_RW_HOST + DB_CREDENTIAL from that service's .env. Never hard-code
 * credentials here.
 */
const fs = require('fs');
const path = require('path');

const cred = JSON.parse(process.env.DB_CREDENTIAL);
const knex = require('knex')({
  client: 'pg',
  connection: {
    host: process.env.PSQL_RW_HOST,
    port: +(process.env.PSQL_PORT || 5432),
    user: cred.username,
    password: cred.password,
    database: cred.dbname,
    ssl: { rejectUnauthorized: false },
  },
});

const OUT = path.join(__dirname, '..', 'data', 'raw.json');

(async () => {
  const out = {};

  // 887 active projects, joined out to the full org hierarchy
  out.projects = await knex('master_upc_project as p')
    .leftJoin('master_state as s', 'p.state_id', 's.id')
    .leftJoin('master_region_zone as r', 'p.region_id', 'r.id')
    .leftJoin('master_piu as pi', 'p.piu_id', 'pi.id')
    .leftJoin('master_zone as z', 'p.nsv_zone_id', 'z.id')
    .leftJoin('master_contractor as c', 'p.contractor_id', 'c.id')
    .leftJoin('master_ae_ie as a', 'p.ae_ie_id', 'a.id')
    .select(
      'p.upc', 'p.project_name', 'p.nh_number', 'p.length_km',
      'p.number_of_lanes', 'p.lane_config',
      'p.start_lat', 'p.start_lng', 'p.end_lat', 'p.end_lng',
      'p.chainage_from_km', 'p.chainage_to_km',
      'p.physical_progress_pct', 'p.financial_progress_pct',
      'p.awarded_cost_cr', 'p.total_capital_cost_cr',
      'p.mode', 'p.corridor', 'p.project_type', 'p.current_stage',
      'p.surface_type', 'p.pci',
      'p.contract_start_date', 'p.contract_end_date', 'p.scheduled_completion_date',
      's.state_name', 'r.region_name', 'r.region_email',
      'pi.piu_name', 'pi.piu_email',
      'z.zone_code', 'z.zone_name',
      'c.contractor_name as contractor', 'a.ae_ie_name as consultant',
    )
    .where('p.is_active', true)
    .orderBy('p.upc');

  // masters, so PIUs/ROs with no projects still appear
  out.pius = await knex('master_piu as pi')
    .leftJoin('master_region_zone as r', 'pi.region_id', 'r.id')
    .leftJoin('master_state as s', 'r.state_id', 's.id')
    .select('pi.piu_name', 'pi.piu_email', 'r.region_name', 's.state_name as ro_home_state')
    .where('pi.is_active', true);

  out.ros = await knex('master_region_zone as r')
    .leftJoin('master_state as s', 'r.state_id', 's.id')
    .leftJoin('master_zone as z', 'r.nsv_zone_id', 'z.id')
    .select('r.region_name', 'r.region_email', 's.state_name as home_state',
            'z.zone_code', 'z.zone_name')
    .where('r.is_active', true)
    .andWhere('r.region_type', 'NSV');

  // administrative district -> RO assignment, extends RO territory
  out.districts = await knex('master_ro_district as d')
    .leftJoin('master_region_zone as r', 'd.region_id', 'r.id')
    .leftJoin('master_state as s', 'd.state_id', 's.id')
    .select('d.district_name', 'r.region_name', 's.state_name')
    .where('d.is_active', true);

  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`wrote ${OUT}`);
  console.log(`  projects ${out.projects.length}  pius ${out.pius.length}` +
              `  ros ${out.ros.length}  districts ${out.districts.length}`);
  await knex.destroy();
})().catch((e) => { console.error(e.message); process.exit(1); });
