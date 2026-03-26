import { MapOutlined, ViewInArOutlined } from "@mui/icons-material";
import { Box, Button, Paper, Stack, Typography } from "@mui/material";
import { Carousel } from "antd";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

type FeatureGroup = {
  key: string;
  title: string;
  tags: string[];
  points: string[];
  actionLabel: string;
  actionPath: string;
};

type HeroSlide = {
  key: string;
  src: string;
  badge: string;
  summary: string;
};

const HERO_SLIDES: HeroSlide[] = [
  {
    key: "import",
    src: "/home/main-import.png",
    badge: "PROJECT UPDATE",
    summary: "IFC Import 상태를 프로젝트 단위로 관리합니다.",
  },
  {
    key: "tiles",
    src: "/home/main-tiles.png",
    badge: "3D TILES",
    summary: "대용량 3D Tiles 변환과 전용 뷰어를 제공합니다.",
  },
  {
    key: "dem",
    src: "/home/main-dem.png",
    badge: "DEM ANALYTICS",
    summary: "DEM 고도 분석과 Terrain 변환 상태를 운영합니다.",
  },
];

const FEATURE_GROUPS: FeatureGroup[] = [
  {
    key: "project-3d",
    title: "프로젝트 단위 3D 모델 관리",
    tags: ["IFC", "3D tiles"],
    points: [
      "IFC 업로드/다운로드 및 표준 Import 상태 관리",
      "IFC 모델 뷰어 및 Import 분석 화면 제공",
      "IFC 기반 대용량 3D Tiles 변환/작업 상태 관리",
      "3D Tiles 전용 뷰어 및 스트리밍 3D 타일 서비스 지원",
    ],
    actionLabel: "3D 프로젝트 바로가기",
    actionPath: "/projects",
  },
  {
    key: "terrain",
    title: "지형 관리 및 Terrain 변환",
    tags: ["TIF", "Terrain"],
    points: [
      "DEM(TIF) 업로드/다운로드 및 메타데이터 분석 ",
      "DEM 3D 전용 뷰어와 지형 고도 프로파일 분석",
      "Terrain 변환 작업 상태 관리 및 결과물 다운로드",
      "3D Terrain 스트리밍 서비스 지원",
    ],
    actionLabel: "DEM 작업 바로가기",
    actionPath: "/dem",
  },
];

export function HomaPage() {
  const navigate = useNavigate();
  const [currentSlide, setCurrentSlide] = useState(0);

  const sideSlides = useMemo(() => {
    const total = HERO_SLIDES.length;
    const prev = HERO_SLIDES[(currentSlide - 1 + total) % total];
    const next = HERO_SLIDES[(currentSlide + 1) % total];
    return { prev, next };
  }, [currentSlide]);

  const selectedSlide = HERO_SLIDES[currentSlide];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.2 }}>
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, md: 3.4 },
          border: "1px solid rgba(171,198,255,0.16)",
          background:
            "radial-gradient(circle at 50% -18%, rgba(77,133,255,0.2), transparent 44%), linear-gradient(180deg, rgba(6,11,21,0.98), rgba(4,8,16,1))",
          textAlign: "center",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <Box sx={{ maxWidth: 900, mx: "auto" }}>
          <Typography
            sx={{
              color: "#f7fbff",
              fontSize: { xs: 28, md: 48 },
              fontWeight: 800,
              lineHeight: 1.12,
              letterSpacing: "-0.02em",
              mt: { xs: 0.8, md: 1.2 },
              whiteSpace: { xs: "normal", md: "nowrap" },
            }}
          >
            3D 지리공간 통합 운영 플랫폼
          </Typography>

          <Typography
            sx={{
              color: "#a5b4cb",
              mt: 1,
              maxWidth: 760,
              mx: "auto",
              fontSize: { xs: 15, md: 20 },
              lineHeight: 1.45,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            디지털 트윈을 위한 작업관리 및 지도 서비스 운영을 지원합니다.
          </Typography>

          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.4}
            sx={{ mt: 5, justifyContent: "center", alignItems: "center" }}
          >
            <Button
              variant="contained"
              onClick={() => navigate("/projects")}
              sx={{
                minWidth: 214,
                borderRadius: 999,
                py: 0.96,
                fontSize: 16,
                fontWeight: 700,
                background: "linear-gradient(180deg, #1c92ff, #1274ff)",
              }}
            >
              3D 프로젝트 바로가기
            </Button>
            <Button
              variant="outlined"
              onClick={() => navigate("/dem")}
              sx={{
                minWidth: 198,
                borderRadius: 999,
                py: 0.96,
                fontSize: 16,
                fontWeight: 600,
                borderColor: "rgba(208,221,246,0.72)",
                color: "#eef4ff",
                "&:hover": {
                  borderColor: "rgba(224,235,255,0.95)",
                },
              }}
            >
              DEM 작업 바로가기
            </Button>
          </Stack>
        </Box>

        <Box
          sx={{
            mt: { xs: 4.4, md: 8.4 },
            position: "relative",
            height: { xs: 180, sm: 260, md: 520 },
            width: "100%",
          }}
        >
          <Box
            sx={{
              position: "absolute",
              left: { xs: "2%", md: "4%" },
              bottom: { xs: 8, md: 26 },
              width: { xs: "34%", md: "22%" },
              borderRadius: 1.8,
              overflow: "hidden",
              border: "1px solid rgba(109,150,230,0.26)",
              display: { xs: "none", lg: "block" },
            }}
          >
            <Box
              component="img"
              src={sideSlides.prev.src}
              alt={sideSlides.prev.summary}
              sx={{
                width: "100%",
                aspectRatio: "16 / 9",
                objectFit: "contain",
                backgroundColor: "#0b1322",
                display: "block",
              }}
            />
          </Box>

          <Box
            sx={{
              position: "absolute",
              right: { xs: "2%", md: "4%" },
              bottom: { xs: 8, md: 26 },
              width: { xs: "34%", md: "22%" },
              borderRadius: 1.8,
              overflow: "hidden",
              border: "1px solid rgba(109,150,230,0.26)",
              display: { xs: "none", lg: "block" },
            }}
          >
            <Box
              component="img"
              src={sideSlides.next.src}
              alt={sideSlides.next.summary}
              sx={{
                width: "100%",
                aspectRatio: "16 / 9",
                objectFit: "contain",
                backgroundColor: "#0b1322",
                display: "block",
              }}
            />
          </Box>

          <Box
            sx={{
              position: "absolute",
              left: "50%",
              bottom: { xs: 0, md: 16 },
              transform: "translateX(-50%)",
              width: { xs: "76%", sm: "62%", md: "48%" },
              borderRadius: 2.3,
              p: { xs: 0.5, md: 0.65 },
              border: "1px solid rgba(171,198,255,0.24)",
              background: "linear-gradient(180deg, rgba(12,18,31,0.98), rgba(8,13,24,0.98))",
              boxShadow: "0 20px 55px rgba(0, 0, 0, 0.42)",
              textAlign: "left",
              ".hero-carousel .slick-dots": {
                bottom: -24,
              },
              ".hero-carousel .slick-dots li button": {
                backgroundColor: "rgba(186,205,238,0.48)",
              },
              ".hero-carousel .slick-dots li.slick-active button": {
                backgroundColor: "#4aa2ff",
              },
            }}
          >
            <Carousel
              className="hero-carousel"
              autoplay
              autoplaySpeed={4500}
              afterChange={setCurrentSlide}
              draggable
            >
              {HERO_SLIDES.map((slide) => (
                <Box key={slide.key}>
                  <Box
                    component="img"
                    src={slide.src}
                    alt={slide.summary}
                    sx={{
                      width: "100%",
                      aspectRatio: "16 / 9",
                      objectFit: "contain",
                      backgroundColor: "#0b1322",
                      display: "block",
                      borderRadius: 1.4,
                    }}
                  />
                </Box>
              ))}
            </Carousel>

            <Box
              sx={{
                mt: 0.55,
                display: "flex",
                alignItems: "center",
                gap: 0.55,
                px: 0.2,
                minWidth: 0,
              }}
            >
              <Box
                sx={{
                  px: 0.7,
                  py: 0.12,
                  borderRadius: 0.65,
                  backgroundColor: "rgba(66, 205, 149, 0.9)",
                  color: "#f7fffa",
                  fontSize: { xs: 9, md: 10 },
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  flexShrink: 0,
                }}
              >
                {selectedSlide.badge}
              </Box>
              <Typography
                sx={{
                  color: "#eaf3ff",
                  fontWeight: 600,
                  fontSize: { xs: 10, md: 11 },
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  minWidth: 0,
                }}
              >
                {selectedSlide.summary}
              </Typography>
            </Box>
          </Box>
        </Box>

        <Box
          sx={{
            mt: { xs: 2.8, md: 4.2 },
            pt: { xs: 1.6, md: 2.2 },
            borderTop: "1px solid rgba(163, 190, 235, 0.08)",
          }}
        >
          <Box
            sx={{
              maxWidth: 1120,
              mx: "auto",
              p: 0,
            }}
          >
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" },
                gap: { xs: 1.2, md: 1.8 },
              }}
            >
              {FEATURE_GROUPS.map((group) => (
                <Box
                  key={group.key}
                  sx={{
                    p: { xs: 1.8, md: 2.4 },
                    textAlign: "left",
                    borderRadius: 2.8,
                    border: "1px solid rgba(173,197,240,0.14)",
                    background:
                      "linear-gradient(180deg, rgba(20,26,38,0.92), rgba(14,19,30,0.95))",
                    boxShadow: "0 16px 40px rgba(0,0,0,0.28)",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: 0,
                      display: "grid",
                      placeItems: "center",
                      color: group.key === "project-3d" ? "#43a1ff" : "#57d493",
                      mb: 1.35,
                    }}
                  >
                    {group.key === "project-3d" ? <ViewInArOutlined /> : <MapOutlined />}
                  </Box>

                  <Typography sx={{ color: "#eef5ff", fontSize: 19, fontWeight: 800 }}>
                    {group.title}
                  </Typography>

                  <Stack direction="row" spacing={0.7} useFlexGap sx={{ mt: 1.05, flexWrap: "wrap", rowGap: 0.65 }}>
                    {group.tags.map((tag) => (
                      <Box
                        key={tag}
                        sx={{
                          px: 0.95,
                          py: 0.2,
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 700,
                          lineHeight: 1.2,
                          letterSpacing: "0.03em",
                          color: group.key === "project-3d" ? "#e7f3ff" : "#e8fff1",
                          border:
                            group.key === "project-3d"
                              ? "1px solid rgba(114, 177, 255, 0.42)"
                              : "1px solid rgba(120, 226, 165, 0.45)",
                          background:
                            group.key === "project-3d"
                              ? "linear-gradient(180deg, rgba(44,116,224,0.3), rgba(21,61,135,0.3))"
                              : "linear-gradient(180deg, rgba(39,151,99,0.3), rgba(18,82,54,0.32))",
                        }}
                      >
                        {tag}
                      </Box>
                    ))}
                  </Stack>

                  <Stack spacing={0.8} sx={{ mt: 2, m: 0, p: 1 }} component="ul">
                    {group.points.map((point) => (
                      <Box
                        key={point}
                        component="li"
                        sx={{
                          color: "#dbe8fb",
                          lineHeight: 1.56,
                          fontSize: 13.6,
                          listStyle: "none",
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 0.8,
                        }}
                      >
                        <Box
                          sx={{
                            width: 6,
                            height: 6,
                            mt: "0.45em",
                            borderRadius: "50%",
                            backgroundColor:
                              group.key === "project-3d"
                                ? "rgba(86, 170, 255, 0.95)"
                                : "rgba(108, 226, 165, 0.95)",
                            flexShrink: 0,
                          }}
                        />
                        <span>{point}</span>
                      </Box>
                    ))}
                  </Stack>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
