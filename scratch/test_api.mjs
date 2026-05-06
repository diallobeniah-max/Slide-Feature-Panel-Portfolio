
const { scrapeInstagramCarousel } = await import('../server/instagramApi.mjs');

async function test() {
  try {
    const url = 'https://www.instagram.com/p/DXZQvF4DMhJ/';
    console.log('Testing URL:', url);
    const result = await scrapeInstagramCarousel(url);
    console.log('Success:', JSON.stringify(result, null, 2));
  } catch (e) {
    console.error('Error:', e);
  }
}

test();
