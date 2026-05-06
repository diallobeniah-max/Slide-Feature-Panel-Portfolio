module.exports = async function ytDownload(req, res) {
  const { handleDownload } = await import("../../server/youtube/youtubeDownload.mjs");
  return handleDownload(req, res);
};
