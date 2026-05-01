module.exports = async function instagramCarousel(req, res) {
  const { handleInstagramCarouselApi } = await import(
    "../server/instagramApi.mjs"
  );
  return handleInstagramCarouselApi(req, res);
};
