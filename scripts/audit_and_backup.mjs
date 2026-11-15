import { execSync } from 'child_process';
import fs from 'fs';

function query(sql) {
  const res = execSync(`npx supabase db query --remote --read-only "${sql.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
    cwd: 'C:/Replete Cloud Apps/wacrm',
    encoding: 'utf-8'
  });
  return JSON.parse(res).rows;
}

async function run() {
  console.log('1. Exporting Flow Definition...');
  const flow = query("SELECT * FROM flows WHERE id = 'b23a968f-6fbb-4d57-b016-538d58a5f8e6';")[0];

  console.log('2. Exporting All 45 Flow Nodes...');
  const nodes = query("SELECT id, flow_id, node_key, node_type, config, created_at FROM flow_nodes WHERE flow_id = 'b23a968f-6fbb-4d57-b016-538d58a5f8e6' ORDER BY node_key;");

  console.log('3. Exporting CRM Custom Fields...');
  const fields = query("SELECT id, field_name, field_type, field_options FROM custom_fields ORDER BY field_name;");

  console.log('4. Exporting CRM Tags...');
  const tags = query("SELECT id, name, color FROM tags ORDER BY name;");

  console.log('5. Exporting CRM Pipeline Stages...');
  let stages = [];
  try {
    stages = query("SELECT id, name, display_order FROM pipeline_stages ORDER BY display_order;");
  } catch (e) {
    console.log('pipeline_stages check:', e.message);
    try {
      stages = query("SELECT id, name FROM deal_stages;");
    } catch (e2) {
      console.log('deal_stages check:', e2.message);
    }
  }

  console.log('6. Checking Automations...');
  let automations = [];
  try {
    automations = query("SELECT id, name, trigger_type, action_type, is_active FROM automations;");
  } catch (e) {
    console.log('Automations check:', e.message);
  }

  const backup = {
    flow,
    nodes,
    fields,
    tags,
    stages,
    automations,
    exported_at: new Date().toISOString()
  };

  const backupDir = 'C:/Replete Cloud Apps/wacrm/docs/backups';
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const timestamp = Date.now();
  fs.writeFileSync(`${backupDir}/flow_b23a968f_backup_${timestamp}.json`, JSON.stringify(backup, null, 2));
  fs.writeFileSync('C:/Replete Cloud Apps/wacrm/docs/backups/live_flow_backup_latest.json', JSON.stringify(backup, null, 2));

  console.log(`Backup complete! Total nodes: ${nodes.length}, custom fields: ${fields.length}, tags: ${tags.length}, pipeline stages: ${stages.length}, automations: ${automations.length}`);
}

run().catch(console.error);
