module.exports = async function instagramMedia(req, res) {
  const { handleInstagramMediaApi } = await import("../server/instagramApi.mjs");
  return handleInstagramMediaApi(req, res);
};
