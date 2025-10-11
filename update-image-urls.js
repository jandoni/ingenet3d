/**
 * Script to update all imageUrl fields in config.json to use local logo files
 * This fixes the issue where external URLs fail to load
 */

const fs = require('fs');
const path = require('path');

// Paths
const configPath = path.join(__dirname, 'src', 'config.json');
const backupPath = path.join(__dirname, 'src', 'config.backup.json');

console.log('🔧 Updating image URLs in config.json...\n');

try {
  // Read config.json
  const configContent = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(configContent);

  // Create backup
  fs.writeFileSync(backupPath, configContent, 'utf8');
  console.log('✅ Backup created: src/config.backup.json\n');

  let changesCount = 0;
  const changes = [];

  // Update each chapter
  config.chapters.forEach((chapter, index) => {
    if (chapter.logoUrl && chapter.imageUrl !== chapter.logoUrl) {
      const oldUrl = chapter.imageUrl;
      const newUrl = chapter.logoUrl;

      chapter.imageUrl = newUrl;
      changesCount++;

      changes.push({
        id: chapter.id,
        title: chapter.title,
        oldUrl: oldUrl,
        newUrl: newUrl
      });
    }
  });

  // Write updated config
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

  console.log(`📝 Updated ${changesCount} image URLs:\n`);

  changes.forEach(change => {
    console.log(`[${change.id}] ${change.title}`);
    console.log(`  ❌ Old: ${change.oldUrl}`);
    console.log(`  ✅ New: ${change.newUrl}`);
    console.log('');
  });

  console.log('✨ Done! All imageUrl fields now point to local files.');
  console.log('📦 Deploy with: AWS_PROFILE=ingenet3d aws s3 sync ./src s3://ingenet3d-webapp-1751575263 --delete');

} catch (error) {
  console.error('❌ Error:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}
