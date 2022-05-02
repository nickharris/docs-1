const { readdir, createReadStream, writeFile } = require("fs-extra");
const { createInterface } = require("readline");
const { join, parse } = require("path");
const prettier = require("prettier");

// This script is not part of faast.js, but rather a tool to rewrite some parts
// of the generated docs from api-generator and api-documenter so they work with
// the website generated by docusaurus.

async function main() {
  const dir = "./reference";
  /** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
  const sidebarItems = [
    {
      label: "API Reference",
      id: "index",
      items: [],
    },
  ];

  const docFiles = await readdir(dir);
  for (const docFile of docFiles) {
    try {
      const { name: id, ext } = parse(docFile);
      if (ext !== ".md") {
        continue;
      }

      const docPath = join(dir, docFile);
      const input = createReadStream(docPath);
      const output = [];
      const lines = createInterface({
        input,
        crlfDelay: Infinity,
      });

      output.push(
        "{/* Do not edit this file. It is automatically generated by API Documenter. */}"
      );

      let title = "";
      lines.on("line", (line) => {
        let skip = false;
        if (!title) {
          const titleLine = line.match(/## (.*)/);
          if (titleLine) {
            title = titleLine[1];
            skip = true;
          }
        }

        const previewWarning =
          line ===
          "> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.";
        if (previewWarning) {
          skip = true;
          output.push(
            ...[
              ":::caution",
              "",
              "This API is provided as a preview for developers and may change based on feedback that we receive.",
              "",
              ":::",
            ]
          );
        }

        // Replace autogenerated warning
        if (line.startsWith("<!--")) {
          skip = true;
        }

        if (line === "> ") {
          skip = true;
        }

        const breadcrumbs = line.startsWith("[Home](./index.md)");
        if (breadcrumbs) {
          // [Home](./index.md)
          // [@zuplo/runtime](./runtime.md)
          // [ApiAuthKeyInboundPolicyOptions](./runtime.apiauthkeyinboundpolicyoptions.md)
          // [authScheme](./runtime.apiauthkeyinboundpolicyoptions.authscheme.md)
          skip = true;
          const links = line.split("&gt;");
          let parentItem;

          links.forEach((link) => {
            const parts = link.trim().match(/\[(.*)\]\((.*)\)/);

            const currentItem = {
              id: parts[2].replace("./", "").replace(".md", ""),
              label: parts[1],
              items: [],
            };

            if (!parentItem) {
              parentItem = sidebarItems.find(
                (item) => item.id === currentItem.id
              );
            } else {
              const testParent = parentItem.items.find(
                (item) => item.id === currentItem.id
              );
              if (testParent) {
                parentItem = testParent;
              } else {
                parentItem.items.push(currentItem);
                parentItem = currentItem;
              }
            }
          });
        }

        // See issue #4. api-documenter expects \| to escape table
        // column delimiters, but docusaurus uses a markdown processor
        // that doesn't support this. Replace with an escape sequence
        // that renders |.
        if (line.startsWith("|")) {
          line = line.replace(/\\\|/g, "&#124;");
        }
        if (!skip) {
          output.push(line);
        }
      });

      await new Promise((resolve) => lines.once("close", resolve));
      input.close();

      const header = [
        "---",
        `id: ${id}`,
        `title: ${title}`,
        `sidebar_class_name: reference-sidebar`,
        "---",
      ];

      await writeFile(docPath, header.concat(output).join("\n"));
    } catch (err) {
      console.error(`Could not process ${docFile}: ${err}`);
    }
  }

  const sidebarFormattedItems = [];

  function formatItem(item, parent) {
    let currentItem;
    if (item.items.length === 0) {
      currentItem = {
        type: "doc",
        label: item.label,
        id: item.id,
      };
    } else {
      currentItem = {
        type: "category",
        label: item.label,
        link: { type: "doc", id: item.id },
        items: [],
      };
      item.items.forEach((child) => {
        formatItem(child, currentItem);
      });
    }
    if (Array.isArray(parent)) {
      parent.push(currentItem);
    } else {
      parent.items.push(currentItem);
    }
  }

  formatItem(sidebarItems[0], sidebarFormattedItems);

  const sidebarPath = "./sidebar.reference.js";
  const code = prettier.format(
    `const sidebars = {
      referenceSidebar: ${JSON.stringify(sidebarFormattedItems[0].items)}
    };
  module.exports = sidebars;`,
    { parser: "babel" }
  );

  await writeFile(sidebarPath, code);
}

main();
