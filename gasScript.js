function doPost(e) {
  let parameter = {};
  try {
    parameter = JSON.parse(e.postData.contents);
  } catch (e) {
    return ContentService.createTextOutput({
      status: false,
      result: 'Invalid JSON'
    }).setMimeType(ContentService.MimeType.JSON);
  }
  let before = parameter.before;
  if (before == "auto") before = "";
  let after = parameter.after;
  let status;
  let text;
  try {
    text = LanguageApp.translate(parameter.text, before, after);
    status = true;
  } catch (e) {
    text = "" + e;
    status = false;
  }
  const result = {}
  result.status = status;
  result.result = text;
  result.text = parameter.text;

  const response = JSON.stringify({ request: parameter, response: result });

  return ContentService.createTextOutput(response).setMimeType(ContentService.MimeType.JSON);
}
