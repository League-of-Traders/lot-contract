import { Client, type CreatePageParameters, type UpdatePageParameters } from "@notionhq/client";

export const notion = new Client({
  auth: process.env.NOTION_SECRET,
});
export const database_id = process.env.NOTION_DB_ID as string;
export const volume_database_id = process.env.NOTION_VOLUME_DB_ID as string;

type TWallet = {
  id: string;
  address: string;
  bnb: string;
  bnbUsd: string;
  lot: string;
  lotUsd: string;
};

export async function createData(data: TWallet) {
  const pageData: CreatePageParameters = {
    parent: {
      database_id,
    },
    properties: {
      id: {
        rich_text: [
          {
            text: {
              content: data.id,
            },
          },
        ],
      },
      address: {
        rich_text: [
          {
            text: {
              content: data.address,
            },
          },
        ],
      },
      bnb: {
        rich_text: [
          {
            text: {
              content: data.bnb,
            },
          },
        ],
      },
      bnbUsd: {
        rich_text: [
          {
            text: {
              content: data.bnbUsd,
            },
          },
        ],
      },
      lot: {
        rich_text: [
          {
            text: {
              content: data.lot,
            },
          },
        ],
      },
      lotUsd: {
        rich_text: [
          {
            text: {
              content: data.lotUsd,
            },
          },
        ],
      },
    },
  };
  return pageData;
}

type TVolume = {
  id: string;
  buyVolume?: number;
  sellVolume?: number;
};

export async function createVolumeData(data: TVolume) {
  const pageData: CreatePageParameters = {
    parent: {
      database_id: volume_database_id,
    },
    properties: {
      id: {
        rich_text: [
          {
            text: {
              content: data.id,
            },
          },
        ],
      },
      buyVolume: {
        number: data?.buyVolume || 0,
      },
      sellVolume: {
        number: data.sellVolume || 0,
      },
    },
  };
  return pageData;
}

export async function updateVolumeData(pageId: string, data: TVolume) {
  const pageData: UpdatePageParameters = {
    page_id: pageId,
    properties: {
      id: {
        rich_text: [
          {
            text: {
              content: data.id,
            },
          },
        ],
      },
      buyVolume: {
        number: data?.buyVolume || 0,
      },
      sellVolume: {
        number: data.sellVolume || 0,
      },
    },
  };
  return pageData;
}

export async function updateData(pageId: string, data: TWallet) {
  const pageData: UpdatePageParameters = {
    page_id: pageId,
    properties: {
      id: {
        rich_text: [
          {
            text: {
              content: data.id,
            },
          },
        ],
      },
      address: {
        rich_text: [
          {
            text: {
              content: data.address,
            },
          },
        ],
      },
      bnb: {
        rich_text: [
          {
            text: {
              content: data.bnb,
            },
          },
        ],
      },
      lot: {
        rich_text: [
          {
            text: {
              content: data.lot,
            },
          },
        ],
      },
    },
  };
  return pageData;
}

// async function fetchWalletData() {
//   const response = await notion.databases.query({
//     database_id,
//   });

//   const items = response.results.map((page) => {
//     const props = page.properties;
//     return {
//       pageId: page.id,
//       id: props["id"]?.rich_text[0]?.plain_text || "",
//       address: props["address"]?.rich_text[0]?.plain_text || "",
//       bnb: props["bnb"]?.rich_text[0]?.plain_text || "",
//       lot: props["lot"]?.rich_text[0]?.plain_text || "",
//     };
//   });

//   return items;
// }

export async function findAndUpdate(data: TVolume) {
  // 1) 데이터 조회
  const response = await notion.databases.query({
    database_id: volume_database_id,
    filter: {
      property: "id",
      rich_text: {
        equals: data.id,
      },
    },
  });

  if (response.results.length === 0) {
    console.log("해당 id가 없습니다.");
    return;
  }

  const pageId = response.results[0].id;
  const buyVolume = response?.results?.[0]?.properties["buyVolume"]?.number;
  const sellVolume = response?.results?.[0]?.properties["sellVolume"]?.number;

  // 2) 업데이트

  if (data.buyVolume) {
    await notion.pages.update({
      page_id: pageId,
      properties: {
        buyVolume: {
          number: data.buyVolume || buyVolume,
        },
      },
    });
  }

  if (data.sellVolume) {
    await notion.pages.update({
      page_id: pageId,
      properties: {
        sellVolume: {
          number: data.sellVolume || sellVolume,
        },
      },
    });
  }

  console.log("업데이트 완료!", data.buyVolume, data.sellVolume);
}

// fetchWalletData();
