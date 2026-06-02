const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const SCREENSHOT_DIR = '/tmp/test-screenshots';

// Ensure screenshot directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const results = {
  pages: [],
  consoleErrors: [],
  serverErrors: [],
  functionalIssues: []
};

async function captureScreenshot(page, name) {
  const filename = `${name.replace(/[^a-z0-9]/gi, '_')}.png`;
  const filepath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: true });
  return filepath;
}

async function testAdminLogin(browser) {
  console.log('\n=== Testing Admin Login ===');
  const page = await browser.newPage();
  const consoleMessages = [];
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleMessages.push(msg.text());
      results.consoleErrors.push(`Admin Login: ${msg.text()}`);
    }
  });

  try {
    await page.goto(`${BASE_URL}/admin/login`, { waitUntil: 'networkidle2' });
    await captureScreenshot(page, 'admin_login_page');
    
    // Fill login form
    await page.type('input[autocomplete="username"]', '13900000001');
    await page.type('input[type="password"]', 'admin123');
    await captureScreenshot(page, 'admin_login_filled');
    
    // Submit form
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 })
    ]);
    
    const url = page.url();
    await captureScreenshot(page, 'admin_after_login');
    
    if (url.includes('/admin') && !url.includes('/login')) {
      results.pages.push({ page: 'Admin Login', status: 'OK', url });
      
      // Test admin sidebar navigation
      const adminPages = [
        { name: 'Assets', path: '/admin/assets' },
        { name: 'Auctions', path: '/admin/auctions' },
        { name: 'Drying', path: '/admin/drying' },
        { name: 'Dictionary', path: '/admin/dict' },
        { name: 'Config', path: '/admin/config' },
        { name: 'Organizations', path: '/admin/organizations' }
      ];
      
      for (const adminPage of adminPages) {
        try {
          console.log(`  Testing ${adminPage.name}...`);
          await page.goto(`${BASE_URL}${adminPage.path}`, { waitUntil: 'networkidle2', timeout: 10000 });
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const screenshot = await captureScreenshot(page, `admin_${adminPage.name.toLowerCase()}`);
          const pageContent = await page.content();
          
          // Check for actual error pages (500, 404, or Next.js error boundaries)
          const hasError = pageContent.includes('<h1>500</h1>') || 
                          pageContent.includes('Application error') ||
                          pageContent.includes('This page could not be found') ||
                          (await page.$('div[role="alert"]')) !== null;
          
          if (hasError) {
            results.serverErrors.push(`${adminPage.name}: Page contains error or crashed`);
            results.pages.push({ page: adminPage.name, status: 'ERROR', url: page.url(), screenshot });
          } else {
            results.pages.push({ page: adminPage.name, status: 'OK', url: page.url(), screenshot });
          }
        } catch (error) {
          results.serverErrors.push(`${adminPage.name}: ${error.message}`);
          results.pages.push({ page: adminPage.name, status: 'ERROR', error: error.message });
        }
      }
      
    } else {
      results.functionalIssues.push('Admin login failed - not redirected to admin dashboard');
      results.pages.push({ page: 'Admin Login', status: 'FAILED', url });
    }
  } catch (error) {
    results.serverErrors.push(`Admin Login: ${error.message}`);
    results.pages.push({ page: 'Admin Login', status: 'ERROR', error: error.message });
  }
  
  await page.close();
}

async function testMobileLogin(browser) {
  console.log('\n=== Testing Mobile User Login ===');
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      results.consoleErrors.push(`Mobile: ${msg.text()}`);
    }
  });

  try {
    await page.goto(`${BASE_URL}/m/login`, { waitUntil: 'networkidle2' });
    await captureScreenshot(page, 'mobile_login_page');
    
    // Fill login form
    await page.type('input[autocomplete="username"]', '13800138000');
    await page.type('input[type="password"]', 'user123');
    await captureScreenshot(page, 'mobile_login_filled');
    
    // Submit form
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 })
    ]);
    
    const url = page.url();
    await captureScreenshot(page, 'mobile_after_login');
    
    if (url.includes('/m') && !url.includes('/login')) {
      results.pages.push({ page: 'Mobile Login', status: 'OK', url });
      
      // Test mobile pages
      const mobilePages = [
        { name: 'Mobile Home', path: '/m' },
        { name: 'Mobile Auctions', path: '/m/auction' },
        { name: 'Mobile Drying', path: '/m/drying' },
        { name: 'Mobile Me', path: '/m/me' }
      ];
      
      for (const mobilePage of mobilePages) {
        try {
          console.log(`  Testing ${mobilePage.name}...`);
          await page.goto(`${BASE_URL}${mobilePage.path}`, { waitUntil: 'networkidle2', timeout: 10000 });
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const screenshot = await captureScreenshot(page, `mobile_${mobilePage.name.replace('Mobile ', '').toLowerCase()}`);
          const pageContent = await page.content();
          
          // Check for actual error pages (500, 404, or Next.js error boundaries)
          const hasError = pageContent.includes('<h1>500</h1>') || 
                          pageContent.includes('Application error') ||
                          pageContent.includes('This page could not be found') ||
                          (await page.$('div[role="alert"]')) !== null;
          
          if (hasError) {
            results.serverErrors.push(`${mobilePage.name}: Page contains error or crashed`);
            results.pages.push({ page: mobilePage.name, status: 'ERROR', url: page.url(), screenshot });
          } else {
            results.pages.push({ page: mobilePage.name, status: 'OK', url: page.url(), screenshot });
          }
        } catch (error) {
          results.serverErrors.push(`${mobilePage.name}: ${error.message}`);
          results.pages.push({ page: mobilePage.name, status: 'ERROR', error: error.message });
        }
      }
      
      // Test auction detail if available
      try {
        await page.goto(`${BASE_URL}/m/auction`, { waitUntil: 'networkidle2' });
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Look for auction links
        const auctionLinks = await page.$$('a[href*="/m/auction/"]');
        if (auctionLinks.length > 0) {
          console.log('  Testing auction detail...');
          await auctionLinks[0].click();
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const screenshot = await captureScreenshot(page, 'mobile_auction_detail');
          results.pages.push({ page: 'Mobile Auction Detail', status: 'OK', url: page.url(), screenshot });
          
          // Check for bid button
          const bidButton = await page.$('button:has-text("出价"), button:has-text("竞拍")');
          if (bidButton) {
            console.log('  Bid button found but not clicking for safety');
            results.functionalIssues.push('Auction bidding button exists (not tested - safety)');
          }
        } else {
          results.functionalIssues.push('No auctions available to test bidding');
        }
      } catch (error) {
        results.functionalIssues.push(`Auction detail test: ${error.message}`);
      }
      
      // Test drying reservation
      try {
        console.log('  Testing drying reservation...');
        await page.goto(`${BASE_URL}/m/drying`, { waitUntil: 'networkidle2' });
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const screenshot = await captureScreenshot(page, 'mobile_drying_page');
        
        // Check for reservation button or form
        const reserveButton = await page.$('button, a[href*="reserve"]');
        if (reserveButton) {
          results.functionalIssues.push('Drying reservation interface exists (not tested - safety)');
        } else {
          results.functionalIssues.push('No drying reservation button visible');
        }
      } catch (error) {
        results.functionalIssues.push(`Drying test: ${error.message}`);
      }
      
    } else {
      results.functionalIssues.push('Mobile login failed - not redirected');
      results.pages.push({ page: 'Mobile Login', status: 'FAILED', url });
    }
  } catch (error) {
    results.serverErrors.push(`Mobile Login: ${error.message}`);
    results.pages.push({ page: 'Mobile Login', status: 'ERROR', error: error.message });
  }
  
  await page.close();
}

async function run() {
  console.log('Starting comprehensive app testing...');
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    await testAdminLogin(browser);
    await testMobileLogin(browser);
  } catch (error) {
    console.error('Fatal error:', error);
    results.serverErrors.push(`Fatal: ${error.message}`);
  } finally {
    await browser.close();
  }

  // Generate report
  console.log('\n\n========================================');
  console.log('TEST REPORT');
  console.log('========================================\n');
  
  console.log('PAGES TESTED:');
  console.log('----------------------------------------');
  results.pages.forEach(p => {
    const status = p.status === 'OK' ? '✓' : '✗';
    console.log(`${status} ${p.page}: ${p.status}`);
    if (p.url) console.log(`  URL: ${p.url}`);
    if (p.screenshot) console.log(`  Screenshot: ${p.screenshot}`);
    if (p.error) console.log(`  Error: ${p.error}`);
  });
  
  console.log('\n\nCONSOLE ERRORS:');
  console.log('----------------------------------------');
  if (results.consoleErrors.length === 0) {
    console.log('None');
  } else {
    results.consoleErrors.forEach(e => console.log(`- ${e}`));
  }
  
  console.log('\n\nSERVER ERRORS:');
  console.log('----------------------------------------');
  if (results.serverErrors.length === 0) {
    console.log('None');
  } else {
    results.serverErrors.forEach(e => console.log(`- ${e}`));
  }
  
  console.log('\n\nFUNCTIONAL ISSUES:');
  console.log('----------------------------------------');
  if (results.functionalIssues.length === 0) {
    console.log('None');
  } else {
    results.functionalIssues.forEach(i => console.log(`- ${i}`));
  }
  
  console.log('\n\nSCREENSHOTS SAVED TO:', SCREENSHOT_DIR);
  console.log('========================================\n');
  
  // Save JSON report
  const reportPath = path.join(SCREENSHOT_DIR, 'test-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log('JSON report saved to:', reportPath);
}

run().catch(console.error);
