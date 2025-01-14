import React, { useState, useEffect } from "react"
import * as d3 from "d3"
import { useD3 } from "./hooks/useD3"
import {
	CategoryFilterState,
	CountryCode,
	CountryScore,
	Percentile,
	Category,
	FilterRange,
} from "../data/datasets/datasetsMapping"
import FactorDistribution from "./FactorDistribution"

type props = {
	categoriesFilterState: Array<CategoryFilterState>
	countriesScores: Map<CountryCode, CountryScore> | undefined
	setSelectedCategory: React.Dispatch<React.SetStateAction<Category>>
	parallelCoordsRanges: FilterRange[]
	changeFilterRanges: (newRanges: Array<FilterRange>) => void
	hoveredCountry: CountryCode | undefined
}

function ParallelCoords({
	categoriesFilterState,
	countriesScores,
	setSelectedCategory,
	changeFilterRanges,
	parallelCoordsRanges,
	hoveredCountry,
}: props) {
	const [selectionExists, setSelectionExists] = useState<boolean>(
		parallelCoordsRanges.some(({ category, range }) => range.length > 0)
	)

	const ref = useD3(
		(container) => {
			if (!countriesScores || categoriesFilterState.length === 0) return

			var margin = { top: 30, right: 40, bottom: 50, left: 45 },
				width = 800 - margin.left - margin.right,
				height = 349 - margin.top - margin.bottom,
				innerHeight = height - 2

			var devicePixelRatio = window.devicePixelRatio || 1

			var normalColor = d3
				.scaleOrdinal()
				.domain(["1%", "10%", "50%", "100%"])
				.range(["#006837BB", "#31a354BB", "#78c679BB", "#c2e699BB"])

			var disabledColor = d3
				.scaleOrdinal()
				.domain(["1%", "10%", "50%", "100%"])
				.range(["#00683708", "#31a35409", "#78c67910", "#c2e69911"])

			let color = (
				percentile: Percentile,
				isIncluded: boolean,
				selectionExists: boolean,
				isHovered: boolean
			) => {
				if (isHovered) return "#c51b7d"
				else if (selectionExists && isIncluded) return normalColor(percentile)
				else
					return selectionExists
						? disabledColor(percentile)
						: normalColor(percentile)
			}

			var types = {
				Number: {
					key: "Number",
					coerce: function (d: number) {
						return Math.max(d, 0) * 100
					},
					extent: d3.extent,
					within: function (d: number, extent: Array<number>, dim: any) {
						const value = dim.type.coerce(d)
						return (
							extent[0] <= dim.scale(value) && dim.scale(value) <= extent[1]
						)
					},
					defaultScale: d3.scaleLinear().range([innerHeight, 0]),
				},
			}

			var dimensions = categoriesFilterState
				.filter(({ category, importanceFactor, matrix }) => matrix)
				.map(({ category, importanceFactor, matrix }) => {
					return {
						key: category,
						description: category,
						type: types["Number"],
						domain: [0, 100],
						scale: d3.scaleLinear().domain([0, 100]).range([innerHeight, 0]),
						brush: d3.brush(),
					}
				})

			var xscale = d3
				.scalePoint<number>()
				.domain(d3.range(dimensions.length))
				.range([0, width])

			let yscale = d3.scaleLinear().range([innerHeight, 0])

			var yAxis = d3.axisLeft(yscale)

			container.select("svg").remove()
			container.select("canvas").remove()

			let svg = container
				.append("svg")
				.attr("width", width + margin.left + margin.right)
				.attr("height", height + margin.top + margin.bottom)
				.append("g")
				.attr("transform", "translate(" + margin.left + "," + margin.top + ")")

			var canvas = container
				.append("canvas")
				.attr("width", width * devicePixelRatio)
				.attr("height", height * devicePixelRatio)
				.style("width", width + "px")
				.style("height", height + "px")
				.style("margin-top", margin.top + "px")
				.style("margin-left", margin.left + "px")

			var ctx = canvas.node()?.getContext("2d")

			if (!ctx) return

			ctx.globalCompositeOperation = "darken"
			ctx.globalAlpha = 0.15
			ctx.lineWidth = 1.5
			ctx.scale(devicePixelRatio, devicePixelRatio)

			var axes = svg
				.selectAll(".axis")
				.data(dimensions)
				.enter()
				.append("g")
				.attr("class", function (d) {
					return "axis " + d.key.replace(/ /g, "_")
				})
				.attr("transform", function (d, i) {
					return "translate(" + xscale(i) + ")"
				})

			// type/dimension default setting happens here
			dimensions.forEach(function (dim) {
				dim.scale.domain(dim.domain)
			})

			render(ctx, countriesScores, selectionExists)

			axes
				.append("g")
				.each(function (d) {
					var renderAxis = yAxis.scale(d.scale) // default axis
					d3.select(this).call(renderAxis)
				})
				.append("text")
				.attr("class", "category-icon")
				.text("⬤")
				.append("text")

			axes
				.insert("text", ".category-icon + *")
				.attr("class", "title")
				.attr("text-anchor", "start")
				.text(function (d) {
					return "description" in d ? d.description : d.key
				})
				.on("click", (d, i) => {
					setSelectedCategory(i.key)
				})

			// Add and store a brush for each axis.
			axes
				.append("g")
				.attr("class", "brush")
				.each(function (d) {
					d3.select(this).call(
						(d.brush = d3
							.brushY()
							.extent([
								[-10, 0],
								[10, innerHeight],
							])
							.on("start", brushstart)
							.on("brush", brush)
							.on("end", brush))
					)
				})
				.selectAll("rect")
				.attr("x", -8)
				.attr("width", 16)

			d3.selectAll(".axis.pl_discmethod .tick text").style("fill", "#EFF3FF")

			function render(
				ctx: CanvasRenderingContext2D,
				data: Map<CountryCode, CountryScore>,
				selectionExists: boolean
			) {
				ctx.clearRect(0, 0, width, height)
				ctx.globalAlpha =
					d3.min([1.15 / Math.pow(categoriesFilterState.length, 0.3), 1]) || 1

				// Draw the highlighted lines last
				data.forEach((score) => {
					if (!score.isIncluded) draw(score, selectionExists)
				})
				data.forEach((score) => {
					if (score.isIncluded) draw(score, selectionExists)
				})

				if (hoveredCountry && data.has(hoveredCountry)) {
					// @ts-ignore
					draw(data.get(hoveredCountry), selectionExists)
				}
			}

			function project(
				data: CountryScore
			): Array<[number | undefined, number] | null> {
				return dimensions.map(function (p, i) {
					const score = data.scores.get(p.key)

					if (score === undefined) return null

					return [xscale(i), p.scale(p.type.coerce(score))]
				})
			}

			function draw(data: CountryScore, selectionExists: boolean) {
				if (!ctx) return

				ctx.strokeStyle = color(
					data.percentile,
					data.isIncluded,
					selectionExists,
					data.code === hoveredCountry
				) as string
				ctx.beginPath()
				var coords = project(data)

				coords.forEach(function (p, i) {
					if (!ctx) return

					// this tricky bit avoids rendering null values as 0
					if (p === null) {
						// this bit renders horizontal lines on the previous/next
						// dimensions, so that sandwiched null values are visible
						if (i > 0) {
							var prev = coords[i - 1]
							if (prev !== null) {
								ctx.moveTo(prev[0] || 0, prev[1])
								ctx.lineTo((prev[0] || 0) + 6, prev[1])
							}
						}
						if (i < coords.length - 1) {
							var next = coords[i + 1]
							if (next !== null) {
								ctx.moveTo((next[0] || 0) - 6, next[1])
							}
						}
						return
					}

					if (i === 0) {
						ctx.moveTo(p[0] || 0, p[1])
						return
					}

					ctx.lineTo(p[0] || 0, p[1])
				})
				ctx.stroke()
			}

			function brushstart(event: any) {
				// @ts-ignore
				event?.sourceEvent?.stopPropagation()
			}

			// Handles a brush event, toggling the display of foreground lines.
			function brush() {
				if (!ctx || !countriesScores) return

				var actives: Array<{
					dimension: any
					extent: d3.BrushSelection | null
				}> = []
				svg
					.selectAll(".axis .brush")
					// @ts-ignore
					.filter(function (d) {
						// @ts-ignore
						return d3.brushSelection(this)
					})
					.each(function (d) {
						actives.push({
							dimension: d,
							// @ts-ignore
							extent: d3.brushSelection(this),
						})
					})

				const ranges = categoriesFilterState.map(
					({ category, importanceFactor, matrix }) => {
						const active = actives.find(
							(active) => active.dimension.key === category
						)
						const activeRange = (
							active
								? active.extent?.map((v) => active?.dimension.scale.invert(v))
								: []
						)?.reverse() as [number, number]

						return { category, range: activeRange }
					}
				)

				changeFilterRanges(ranges)

				countriesScores?.forEach(function (
					countryScore: CountryScore,
					key: CountryCode
				) {
					let isIncluded = actives.every(function (active) {
						var dim = active.dimension

						// test if point is within extents for each active brush
						return dim.type.within(
							countryScore.scores.get(dim.key),
							active.extent,
							dim
						)
					})

					countriesScores.set(key, {
						...countryScore,
						isIncluded: isIncluded,
					})
				})

				render(ctx, countriesScores, actives.length !== 0)
			}

			svg.selectAll(".axis .brush").each(function (d) {
				let ranges = parallelCoordsRanges.find(
					// @ts-ignore
					(state) => d.key === state.category
				)?.range

				if (ranges && ranges.length > 0) {
					// @ts-ignore
					let projectedRange = ranges.map((v) => d.scale(v))

					d3.select(this)
						// @ts-ignore
						.call(d.brush.move, [projectedRange[1], projectedRange[0]])
						.selectAll("rect")
						.attr("x", -8)
						.attr("width", 16)
				}
			})
		},
		[
			categoriesFilterState,
			countriesScores,
			parallelCoordsRanges,
			selectionExists,
			hoveredCountry,
		]
	)

	useEffect(() => {
		setSelectionExists(
			parallelCoordsRanges.some(({ category, range }) => range.length > 0)
		)
	}, [parallelCoordsRanges])

	return (
		<div className="parallel-panel" ref={ref}>
			{categoriesFilterState && (
				<FactorDistribution categoriesFilterState={categoriesFilterState} />
			)}
		</div>
	)
}

export default ParallelCoords
