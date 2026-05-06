module.exports = async function ytSubtitles(req, res) {
  const { handleSubtitles } = await import("../../server/youtube/youtubeDownload.mjs");
  return handleSubtitles(req, res);
};
