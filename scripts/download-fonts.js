const fs = require('fs');
const path = require('path');
const https = require('https');

const destDir = path.join(__dirname, '..', 'public', 'fonts');

// Make sure the destination directory exists
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
  console.log(`Created directory: ${destDir}`);
}

const fonts = [
  {
    name: 'Inter-Regular.woff2',
    url: 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hiA.woff2'
  },
  {
    name: 'Inter-Medium.woff2',
    url: 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuI6fAZ9hiA.woff2'
  },
  {
    name: 'Inter-SemiBold.woff2',
    url: 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYAZ9hiA.woff2'
  },
  {
    name: 'Inter-Bold.woff2',
    url: 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYAZ9hiA.woff2'
  },
  {
    name: 'NotoSansDevanagari-Regular.woff2',
    url: 'https://fonts.gstatic.com/s/notosansdevanagari/v30/TuGoUUFzXI5FBtUq5a8bjKYTZjtRU6Sgv3NaV_SNmI0b8QQCQmHn6B2OHjbL_08AlXQl--Y5oQ.woff2'
  },
  {
    name: 'NotoSansDevanagari-Medium.woff2',
    url: 'https://fonts.gstatic.com/s/notosansdevanagari/v30/TuGoUUFzXI5FBtUq5a8bjKYTZjtRU6Sgv3NaV_SNmI0b8QQCQmHn6B2OHjbL_08AlUYl--Y5oQ.woff2'
  },
  {
    name: 'NotoSansDevanagari-SemiBold.woff2',
    url: 'https://fonts.gstatic.com/s/notosansdevanagari/v30/TuGoUUFzXI5FBtUq5a8bjKYTZjtRU6Sgv3NaV_SNmI0b8QQCQmHn6B2OHjbL_08Alaoi--Y5oQ.woff2'
  },
  {
    name: 'NotoSansDevanagari-Bold.woff2',
    url: 'https://fonts.gstatic.com/s/notosansdevanagari/v30/TuGoUUFzXI5FBtUq5a8bjKYTZjtRU6Sgv3NaV_SNmI0b8QQCQmHn6B2OHjbL_08AlZMi--Y5oQ.woff2'
  }
];

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: HTTP ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          const stats = fs.statSync(dest);
          if (stats.size === 0) {
            reject(new Error(`Downloaded file is empty: ${dest}`));
          } else {
            console.log(`Successfully downloaded: ${path.basename(dest)} (${stats.size} bytes)`);
            resolve();
          }
        });
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {}); // delete partial file
      reject(err);
    });
  });
}

async function main() {
  console.log('Starting font downloads...');
  for (const font of fonts) {
    const destPath = path.join(destDir, font.name);
    try {
      await downloadFile(font.url, destPath);
    } catch (err) {
      console.error(`Error downloading ${font.name}:`, err.message);
      process.exit(1);
    }
  }
  console.log('All fonts downloaded successfully!');
}

main();
