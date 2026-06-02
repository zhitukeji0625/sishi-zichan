const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const SCREENSHOT_DIR = '/tmp/test-screenshots';

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const results = {
  pages: [],
  consoleErrors: [],
  serverErrors: [],
  functionalIssues: [],
  warnings: []
};

async function captureScreenshot(page, name) {
  const filename = `${name.replace(/[^a-z0-9]/gi, '_')}.png`;
  const filepath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: false, clip: { x: 0, y: 0, width: 1280, height: 800 } });
  return filepath;
}

async function testPage(page, name, url) {
  try {
    const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const status = response.status();
    const screenshot = await captureScreenshot(page, name.toLowerCase().replace(/\s+/g, '_'));
    
    // Check for error indicators
    const bodyText = await page.evaluate(() => document.body.innerText);
    const hasUnauthorized = bodyText.includes('Unauthorized') || bodyText.includes('未授权');
    const has500Error = bodyText.includes('500') && bodyText.includes('error');
    const hasAppError = bodyText.includes('Application error');
    const has404 = bodyText.includes('404') && bodyText.includes('not be found');
    
    let pageStatus = 'OK';
    let notes = [];
    
    if (status >= 500) {
      pageStatus = 'ERROR';
      notes.push(`HTTP ${status}`);
    } else if (status === 404) {
      pageStatus = 'ERROR';
      notes.push('404 Not Found');
    } else if (hasUnauthorized) {
      pageStatus = 'UNAUTHORIZED';
      notes.push('Access denied');
    } else if (hasAppError || has500Error) {
      pageStatus = 'ERROR';
      notes.push('Application error');
    } else if (has404) {
      pageStatus = 'ERROR';
      notes.push('Page not found');
    } else if (status >= 300) {
      pageStatus = 'WARNING';
      notes.push(`HTTP ${status}`);
    }
    
    results.pages.push({
      page: name,
      status: pageStatus,
      url: page.url(),
      httpStatus: status,
      screenshot,
      notes: notes.length > 0 ? notes.join(', ') : undefined
    });
    
    if (pageStatus === 'ERROR') {
      results.serverErrors.push(`${name}: ${notes.join(', ')}`);
    }
    
    return pageStatus;
  } catch (error) {
    results.serverErrors.push(`${name}: ${error.message}`);
    results.pages.push({
      page: name,
      status: 'ERROR',
      error: error.message
    });
    return 'ERROR';
  }
}

async function testAdminFlow(browser) {
  console.log('\n=== Testing Admin Flow ===');
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      results.consoleErrors.push(`Admin: ${msg.text()}`);
    }
  });

  page.on('pageerror', error => {
    results.consoleErrors.push(`Admin JS Error: ${error.message}`);
  });

  // Login
  await page.goto(`${BASE_URL}/admin/login`, { waitUntil: 'networkidle2' });
  await captureScreenshot(page, 'admin_01_login');
  
  await page.type('input[autocomplete="username"]', '13900000001');
  await page.type('input[type="password"]', 'admin123');
  
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 })
  ]);
  
  const afterLoginUrl = page.url();
  await captureScreenshot(page, 'admin_02_dashboard');
  
  if (afterLoginUrl.includes('/admin') && !afterLoginUrl.includes('/login')) {
    results.pages.push({ page: 'Admin Login', status: 'OK', url: afterLoginUrl });
    console.log('✓ Admin login successful');
    
    // Test admin pages
    const adminPages = [
      { name: 'Admin Dashboard', path: '/admin' },
      { name: 'Admin Assets', path: '/admin/assets' },
      { name: 'Admin Auctions', path: '/admin/auctions' },
      { name: 'Admin Drying', path: '/admin/drying' },
      { name: 'Admin Dictionary', path: '/admin/dict' },
      { name: 'Admin Config', path: '/admin/config' },
      { name: 'Admin Organizations', path: '/admin/organizations' }
    ];
    
    for (const adminPage of adminPages) {
      console.log(`  Testing ${adminPage.name}...`);
      const status = await testPage(page, adminPage.name, `${BASE_URL}${adminPage.path}`);
      console.log(`  ${status === 'OK' ? '✓' : '✗'} ${adminPage.name}: ${status}`);
    }
  } else {
    results.pages.push({ page: 'Admin Login', status: 'FAILED', url: afterLoginUrl });
    results.functionalIssues.push('Admin login failed - unexpected redirect');
  }
  
  await page.close();
}

async function testMobileFlow(browser) {
  console.log('\n=== Testing Mobile Flow ===');
  const page = await browser.newPage();
  await page.setViewport({ width: 375, height: 667 }); // Mobile viewport
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      results.consoleErrors.push(`Mobile: ${msg.text()}`);
    }
  });

  page.on('pageerror', error => {
    results.consoleErrors.push(`Mobile JS Error: ${error.message}`);
  });

  // Login
  await page.goto(`${BASE_URL}/m/login`, { waitUntil: 'networkidle2' });
  await captureScreenshot(page, 'mobile_01_login');
  
  await page.type('input[autocomplete="username"]', '13800138000');
  await page.type('input[type="password"]', 'user123');
  
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 })
  ]);
  
  const afterLoginUrl = page.url();
  await captureScreenshot(page, 'mobile_02_home');
  
  if (afterLoginUrl.includes('/m') && !afterLoginUrl.includes('/login')) {
    results.pages.push({ page: 'Mobile Login', status: 'OK', url: afterLoginUrl });
    console.log('✓ Mobile login successful');
    
    // Test mobile pages
    const mobilePages = [
      { name: 'Mobile Home', path: '/m' },
      { name: 'Mobile Auctions', path: '/m/auction' },
      { name: 'Mobile Drying', path: '/m/drying' },
      { name: 'Mobile Me', path: '/m/me' }
    ];
    
    for (const mobilePage of mobilePages) {
      console.log(`  Testing ${mobilePage.name}...`);
      const status = await testPage(page, mobilePage.name, `${BASE_URL}${mobilePage.path}`);
      console.log(`  ${status === 'OK' ? '✓' : '✗'} ${mobilePage.name}: ${status}`);
    }
    
    // Check for auctions
    console.log('  Checking for auction listings...');
    await page.goto(`${BASE_URL}/m/auction`, { waitUntil: 'networkidle2' });
    const auctionLinks = await page.$$eval('a[href*="/m/auction/"]', links => links.length);
    
    if (auctionLinks > 0) {
      console.log(`  Found ${auctionLinks} auction(s)`);
      results.functionalIssues.push(`${auctionLinks} auction(s) available (not tested - safety)`);
    } else {
      console.log('  No auctions found');
      results.functionalIssues.push('No auctions available to test bidding');
    }
    
    // Check drying page
    console.log('  Checking drying reservation interface...');
    await page.goto(`${BASE_URL}/m/drying`, { waitUntil: 'networkidle2' });
    const hasDryingSlots = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('预约') || text.includes('晒场');
    });
    
    if (hasDryingSlots) {
      console.log('  Drying interface present');
      results.functionalIssues.push('Drying reservation interface exists (not tested - safety)');
    } else {
      console.log('  No drying interface detected');
    }
    
  } else {
    results.pages.push({ page: 'Mobile Login', status: 'FAILED', url: afterLoginUrl });
    results.functionalIssues.push('Mobile login failed - unexpected redirect');
  }
  
  await page.close();
}

async function run() {
  console.log('Starting comprehensive Next.js app testing...');
  console.log(`Base URL: ${BASE_URL}`);
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    await testAdminFlow(browser);
    await testMobileFlow(browser);
  } catch (error) {
    console.error('\nFatal error:', error);
    results.serverErrors.push(`Fatal: ${error.message}`);
  } finally {
    await browser.close();
  }

  // Generate report
  console.log('\n\n' + '='.repeat(60));
  console.log('COMPREHENSIVE TEST REPORT');
  console.log('='.repeat(60) + '\n');
  
  console.log('PAGES TESTED:');
  console.log('-'.repeat(60));
  
  const okCount = results.pages.filter(p => p.status === 'OK').length;
  const errorCount = results.pages.filter(p => p.status === 'ERROR').length;
  const warnCount = results.pages.filter(p => p.status === 'WARNING').length;
  const otherCount = results.pages.filter(p => !['OK', 'ERROR', 'WARNING'].includes(p.status)).length;
  
  results.pages.forEach(p => {
    const icon = p.status === 'OK' ? '✓' : '✗';
    console.log(`${icon} ${p.page}: ${p.status}`);
    if (p.url) console.log(`  URL: ${p.url}`);
    if (p.httpStatus) console.log(`  HTTP Status: ${p.httpStatus}`);
    if (p.notes) console.log(`  Notes: ${p.notes}`);
    if (p.screenshot) console.log(`  Screenshot: ${p.screenshot}`);
    if (p.error) console.log(`  Error: ${p.error}`);
    console.log();
  });
  
  console.log(`Summary: ${okCount} OK, ${errorCount} ERROR, ${warnCount} WARNING, ${otherCount} OTHER\n`);
  
  console.log('CONSOLE ERRORS:');
  console.log('-'.repeat(60));
  if (results.consoleErrors.length === 0) {
    console.log('None\n');
  } else {
    results.consoleErrors.forEach(e => console.log(`- ${e}`));
    console.log();
  }
  
  console.log('SERVER ERRORS:');
  console.log('-'.repeat(60));
  if (results.serverErrors.length === 0) {
    console.log('None\n');
  } else {
    results.serverErrors.forEach(e => console.log(`- ${e}`));
    console.log();
  }
  
  console.log('FUNCTIONAL ISSUES & NOTES:');
  console.log('-'.repeat(60));
  if (results.functionalIssues.length === 0) {
    console.log('None\n');
  } else {
    results.functionalIssues.forEach(i => console.log(`- ${i}`));
    console.log();
  }
  
  console.log('SCREENSHOTS:');
  console.log('-'.repeat(60));
  console.log(`Saved to: ${SCREENSHOT_DIR}`);
  const screenshots = fs.readdirSync(SCREENSHOT_DIR).filter(f => f.endsWith('.png'));
  console.log(`Total: ${screenshots.length} files\n`);
  
  // Save JSON report
  const reportPath = path.join(SCREENSHOT_DIR, 'test-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log('JSON report saved to:', reportPath);
  console.log('='.repeat(60) + '\n');
}

run().catch(console.error);
