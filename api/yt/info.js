module.exports = async function ytInfo(req, res) {
  const { handleInfo } = await import("../../server/youtube/youtubeInfo.mjs");
  return handleInfo(req, res);
};
