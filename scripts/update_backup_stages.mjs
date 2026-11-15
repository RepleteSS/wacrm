import { execSync } from 'child_process';
import fs from 'fs';

function query(sql) {
  const res = execSync(`npx supabase db query --remote --read-only "${sql.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
    cwd: 'C:/Replete Cloud Apps/wacrm',
    encoding: 'utf-8'
  });
  return JSON.parse(res).rows;
}

try {
  const pipelines = query("SELECT id, name FROM pipelines;");
  const stages = query("SELECT id, pipeline_id, name, position, color FROM pipeline_stages ORDER BY pipeline_id, position;");
  const automations = query("SELECT id, name, trigger_type, is_active FROM automations;");

  const backup = JSON.parse(fs.readFileSync('C:/Replete Cloud Apps/wacrm/docs/backups/live_flow_backup_latest.json', 'utf-8'));
  backup.pipelines = pipelines;
  backup.stages = stages;
  backup.automations = automations;

  fs.writeFileSync('C:/Replete Cloud Apps/wacrm/docs/backups/live_flow_backup_latest.json', JSON.stringify(backup, null, 2));
  console.log(`Updated backup with ${pipelines.length} pipelines, ${stages.length} stages, ${automations.length} automations`);
} catch (e) {
  console.error('Error:', e.message);
}
