from playwright.sync_api import sync_playwright


def print_result(name: str, value: object) -> None:
    print(f"{name}={value}")


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        console_messages = []

        page.on("console", lambda msg: console_messages.append(f"{msg.type}: {msg.text}"))
        page.goto("http://localhost:5173")
        page.wait_for_load_state("networkidle")

        print_result("title", page.title())
        print_result("toolbox_present", page.locator("[data-testid=toolbox]").count() > 0)
        print_result("canvas_present", page.locator("[data-testid=flow-canvas]").count() > 0)

        initial_nodes = page.locator("[data-testid^='block-node-']").count()
        print_result("initial_nodes", initial_nodes)

        # Click-add flow.
        page.locator("[data-testid='action-block-click']").click()
        page.wait_for_timeout(1000)
        after_click_nodes = page.locator("[data-testid^='block-node-']").count()
        print_result("after_click_nodes", after_click_nodes)
        print_result("click_add_created_node", after_click_nodes == initial_nodes + 1)
        print_result("flow_name_present_after_click", page.locator("text=快速流程_").count() > 0)

        # Precision placement flow.
        page.get_by_role("button", name="在白板上指定位置放置 循环").click()
        page.wait_for_timeout(500)
        print_result("placement_mode_armed", page.locator("text=当前放置: loop").count() > 0)

        canvas = page.locator("[data-testid='flow-canvas']")
        box = canvas.bounding_box()
        if box is None:
            raise RuntimeError("Canvas bounding box not available")

        page.mouse.move(box["x"] + box["width"] * 0.68, box["y"] + box["height"] * 0.58)
        page.wait_for_timeout(200)
        print_result("placement_preview_visible", page.locator(".flow-canvas__placement-preview").count() > 0)

        page.mouse.click(box["x"] + box["width"] * 0.68, box["y"] + box["height"] * 0.58)
        page.wait_for_timeout(1000)
        after_precise_nodes = page.locator("[data-testid^='block-node-']").count()
        print_result("after_precise_nodes", after_precise_nodes)
        print_result("precision_place_created_node", after_precise_nodes == after_click_nodes + 1)

        # Re-arm and cancel using banner.
        page.get_by_role("button", name="在白板上指定位置放置 循环").click()
        page.wait_for_timeout(120)
        page.get_by_role("button", name="当前放置: loop · 点击取消").click()
        page.wait_for_timeout(150)
        print_result("placement_cancelled", page.locator("text=当前放置: loop").count() == 0)

        for index, message in enumerate(console_messages[:20]):
            print_result(f"console_{index}", message)

        browser.close()


if __name__ == "__main__":
    main()
